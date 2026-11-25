import {Decimal} from "decimal.js";

export type RawRow={row:number;cells:Record<string,string|number|boolean>};
export type Binding={cell:string;media:string;sha256:string};
export type Workbook={sourceHash:string;sheets:{name:string;rows:RawRow[];images:Binding[]}[]};
export type ImportIssue={severity:"error"|"warning";code:string;sheet:string;cell:string;sourceId?:string};
export type StagedRecipe={sourceId:string;rawVersion:string;sources:RawRow[];ingredients:RawRow[];steps:RawRow[];images:Binding[];prep:string|null;cook:string|null;total:string|null;issues:ImportIssue[]};

export function decimalSource(value:unknown):string|null {
  if(value===undefined||value===null||value==="")return null;
  if(typeof value!=="number"&&typeof value!=="string")throw new Error("INVALID_NUMBER");
  const normalized=String(value).trim();
  if(!/^\d+(?:\.\d+)?$/.test(normalized))throw new Error("INVALID_NUMBER");
  const result=new Decimal(normalized);
  if(!result.isFinite()||result.lt(0))throw new Error("INVALID_NUMBER");
  return result.toString();
}

function referencedOrdinals(raw:unknown):number[] {
  if(raw==null||raw===""||raw==="—")return [];
  return String(raw).split(/[、,，;；]/).flatMap(item=>{
    const match=item.trim().match(/^(\d+)(?:\s*[-–—~～]\s*(\d+))?$/);
    if(!match)return [NaN];
    const start=Number(match[1]),end=Number(match[2]??match[1]);
    return end>=start&&end-start<=100?Array.from({length:end-start+1},(_,i)=>start+i):[NaN];
  });
}

export function stageWorkbook(workbook:Workbook){
  const expected=["菜谱","用料","步骤"];
  const sheets=expected.map(name=>workbook.sheets.find(sheet=>sheet.name===name));
  if(sheets.some(sheet=>!sheet))throw new Error("MISSING_SOURCE_SHEET");
  const [recipes,ingredients,steps]=sheets as [Workbook["sheets"][number],Workbook["sheets"][number],Workbook["sheets"][number]];
  if(recipes.rows[0]?.cells.A!=="菜谱ID"||ingredients.rows[0]?.cells.D!=="用料"||steps.rows[0]?.cells.D!=="操作")throw new Error("INVALID_SOURCE_HEADERS");
  const issues:ImportIssue[]=[];
  const drafts:StagedRecipe[]=[];
  const key=(id:unknown,version:unknown)=>String(id??"")+"\u0000"+String(version??"");
  const recipeRows=recipes.rows.filter(row=>row.row>1);
  const keys=new Set<string>();
  for(const row of recipeRows){
    if(typeof row.cells.A!=="string"||!/^R\d+$/.test(row.cells.A)||typeof row.cells.C!=="string"||!row.cells.C.trim()||typeof row.cells.B!=="string"||!row.cells.B.trim())throw new Error("INVALID_RECIPE_IDENTITY:菜谱!A"+row.row);
    const identity=key(row.cells.A,row.cells.C);
    if(keys.has(identity))throw new Error("DUPLICATE_RECIPE_IDENTITY:菜谱!A"+row.row);
    keys.add(identity);
  }
  for(const sheet of [ingredients,steps]){
    for(const row of sheet.rows.filter(value=>value.row>1&&!keys.has(key(value.cells.A,value.cells.B)))){
      const first=Object.keys(row.cells)[0]??"A";
      issues.push({severity:"error",code:"ORPHAN_ROW",sheet:sheet.name,cell:first+row.row});
    }
  }
  for(const row of recipeRows){
    const sourceId=String(row.cells.A),rawVersion=String(row.cells.C);
    const identity=key(sourceId,rawVersion);
    const matching=(sheet:typeof ingredients)=>sheet.rows.filter(value=>value.row>1&&key(value.cells.A,value.cells.B)===identity);
    const lines=matching(ingredients),directions=matching(steps);
    const recipeIssues:ImportIssue[]=[];
    const issue=(severity:ImportIssue["severity"],code:string,sheet:string,cell:string)=>recipeIssues.push({severity,code,sheet,cell,sourceId});
    const time=(column:"U"|"V")=>{
      try{return decimalSource(row.cells[column]);}
      catch{issue("error","INVALID_TIME","菜谱",column+row.row);return null;}
    };
    const prep=time("U"),cook=time("V");
    const total=prep===null||cook===null?null:new Decimal(prep).plus(cook).toString();
    if(total===null)issue("warning","UNKNOWN_TOTAL_TIME","菜谱","U"+row.row);
    if(!lines.length||!directions.length)issue("error","MISSING_CHILD_ROWS","菜谱","A"+row.row);
    function sequence(rows:RawRow[],sheet:string){
      const ids=new Set<number>();
      for(const value of rows){
        const order=Number(value.cells.C);
        if(!Number.isSafeInteger(order)||order<1||ids.has(order))issue("error","INVALID_SEQUENCE",sheet,"C"+value.row);
        ids.add(order);
      }
      if(rows.length&&Array.from({length:rows.length},(_,i)=>i+1).some(order=>!ids.has(order)))issue("error","SEQUENCE_GAP",sheet,"C"+rows[0]!.row);
      return ids;
    }
    const lineNumbers=sequence(lines,"用料");
    sequence(directions,"步骤");
    for(const line of lines){
      const value=line.cells.E;
      if(value===undefined)issue("error","MISSING_QUANTITY","用料","E"+line.row);
      else if(value!=="适量"){
        try {
          decimalSource(value);
          if(!line.cells.F)issue("error","MISSING_UNIT","用料","F"+line.row);
        }catch{issue("error","QUANTITY_NEEDS_REVIEW","用料","E"+line.row);}
      }
    }
    for(const step of directions){
      if(!step.cells.D)issue("error","MISSING_INSTRUCTION","步骤","D"+step.row);
      if(referencedOrdinals(step.cells.E).some(order=>!lineNumbers.has(order)))issue("error","UNRESOLVED_INGREDIENT_REFERENCE","步骤","E"+step.row);
      try{decimalSource(step.cells.H);}catch{issue("error","INVALID_STEP_TIME","步骤","H"+step.row);}
    }
    const anchors=recipes.images.filter(image=>Number(image.cell.match(/\d+$/)?.[0])===row.row);
    if(!anchors.length)issue("warning","NO_ANCHORED_COVER","菜谱","AA"+row.row);
    if(String(row.cells.J??"").includes("清单"))issue("warning","DICTIONARY_MAPPING_PENDING","菜谱","J"+row.row);
    issues.push(...recipeIssues);
    drafts.push({sourceId,rawVersion,sources:[row],ingredients:lines,steps:directions,images:anchors,prep,cook,total,issues:recipeIssues});
  }
  return {drafts,issues,sourceHash:workbook.sourceHash,publicationReady:0};
}

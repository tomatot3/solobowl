import {describe,expect,it} from "vitest";
import {decimalSource,stageWorkbook,type RawRow,type Workbook} from "@/domain/content/normalize";

function makeWorkbook():Workbook {
  const inputs=[
    {id:"R012",prep:" 300 ",cook:20},
    {id:"R013",prep:5,cook:undefined},
    {id:"R015",prep:10,cook:"15"},
    {id:"R016",prep:15,cook:60},
  ];
  const rows=(headers:RawRow["cells"],entries:RawRow["cells"][]):RawRow[]=>[
    {row:1,cells:headers},
    ...entries.map((cells,index)=>({row:index+2,cells})),
  ];
  return {sourceHash:"test-fixture",sheets:[
    {name:"菜谱",images:[],rows:rows({A:"菜谱ID"},inputs.map(({id,prep,cook})=>({
      A:id,B:"测试菜谱",C:"v0.1",U:prep,...(cook===undefined?{}:{V:cook}),...(id==="R012"?{J:"清单"}:{}),
    })))},
    {name:"用料",images:[],rows:rows({D:"用料"},inputs.map(({id},index)=>({
      A:id,B:"v0.1",C:1,D:"测试用料",E:index===0?"适量":20,...(index===1?{}:{F:"克"}),
    })))},
    {name:"步骤",images:[],rows:[...rows({D:"操作"},inputs.map(({id})=>({
      A:id,B:"v0.1",C:1,D:"测试步骤",E:"1",
    }))),{row:82,cells:{J:"孤立文字"}}]},
  ]};
}

describe("workbook normalization",()=>{
  it("normalizes decimal text without inventing absent or ambiguous numbers",()=>{
    expect(decimalSource(" 10.50 ")).toBe("10.5");
    expect(decimalSource(0)).toBe("0");
    expect(decimalSource(undefined)).toBeNull();
    expect(()=>decimalSource("5–10")).toThrow("INVALID_NUMBER");
  });

  it("keeps unknown totals, original version keys, and source issue locations",()=>{
    const report=stageWorkbook(makeWorkbook());
    expect(report.drafts.map(draft=>[draft.sourceId,draft.rawVersion,draft.total])).toEqual([
      ["R012","v0.1","320"],["R013","v0.1",null],["R015","v0.1","25"],["R016","v0.1","75"],
    ]);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:"ORPHAN_ROW",sheet:"步骤",cell:"J82"}),
      expect.objectContaining({code:"MISSING_UNIT",sheet:"用料",cell:"F3"}),
      expect.objectContaining({code:"DICTIONARY_MAPPING_PENDING",sheet:"菜谱",cell:"J2"}),
    ]));
    expect(report.drafts[0]?.ingredients[0]?.cells.E).toBe("适量");
    expect(report.drafts.every(draft=>draft.steps.every(step=>step.row!==82))).toBe(true);
    expect(report.publicationReady).toBe(0);
  });

  it("rejects different source content with the same recipe and version key",()=>{
    const workbook=makeWorkbook();
    const rows=workbook.sheets[0]!.rows;
    rows.push({row:6,cells:{...rows[1]!.cells,B:"修改后的内容"}});
    expect(()=>stageWorkbook(workbook)).toThrow("DUPLICATE_RECIPE_IDENTITY:菜谱!A6");
  });
});

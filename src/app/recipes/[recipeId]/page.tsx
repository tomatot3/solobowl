import Details from "./Details";
export default async function RecipePage({params,searchParams}:{params:Promise<{recipeId:string}>;searchParams:Promise<{version?:string}>}){return <Details recipeId={(await params).recipeId} versionId={(await searchParams).version??""}/>;}

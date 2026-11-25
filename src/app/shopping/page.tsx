import Shopping from "./Shopping";
export default async function Page({searchParams}:{searchParams:Promise<{task?:string}>}){
  return <Shopping preselected={(await searchParams).task??null}/>;
}

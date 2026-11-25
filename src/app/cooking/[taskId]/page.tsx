import Cook from "./Cook";
export default async function Page({params}:{params:Promise<{taskId:string}>}){
  return <Cook taskId={(await params).taskId}/>;
}

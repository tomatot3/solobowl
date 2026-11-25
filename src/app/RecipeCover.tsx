import Image from "next/image";

export default function RecipeCover({image,name}: {image?:string|null;name:string}) {
  if(!image||!/^\/(?:content|api\/v1\/demo-covers)\/[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(image))return null;
  return <div className="recipe-cover"><Image src={image} alt={name+"的封面"} fill unoptimized sizes="(max-width: 600px) 45vw, 320px"/></div>;
}

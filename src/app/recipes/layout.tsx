import {FavoritesProvider} from "./FavoriteButton";
import type {ReactNode} from "react";
export default function RecipesLayout({children}:{children:ReactNode}){
  return <FavoritesProvider>{children}</FavoritesProvider>;
}

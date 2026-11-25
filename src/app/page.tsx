"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";
import {hasOnboardingMarker} from "../client/storage/onboarding";
export default function Home(){const router=useRouter();useEffect(()=>{try{router.replace(hasOnboardingMarker()?"/kitchen":"/welcome");}catch{router.replace("/welcome");}},[router]);return <main><h1>食有数</h1><p role="status">正在打开你的厨房…</p></main>;}

export const ONBOARDING_KEY="shiyoushu:onboarding";
export function hasOnboardingMarker():boolean{return ["skipped","completed"].includes(localStorage.getItem(ONBOARDING_KEY)??"");}
export function skipOnboarding():void{localStorage.setItem(ONBOARDING_KEY,"skipped");}

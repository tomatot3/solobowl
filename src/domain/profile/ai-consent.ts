export const AI_NOTICE_VERSION="p0-ai-v1";

export type AiConsentState={
  noticeVersion:string;
  noticeUrl:string|null;
  granted:boolean;
};

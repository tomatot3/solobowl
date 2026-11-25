const events=["http.request","recipe.excluded","sync.operation","privacy.purge","service.unavailable"] as const;
const reasons=["safety_unknown","safety_excluded","equipment_excluded","time_excluded","not_published","not_current","outside_scope","invalid_content","revision_conflict","adapter_unavailable","internal_error"] as const;
export type LogEvent=typeof events[number];
export type LogReason=typeof reasons[number];
export type LogRecord={event:LogEvent;requestId?:string;subjectRef?:string;entityId?:string;reason?:LogReason;count?:number;durationMs?:number;status?:number};
export interface LogSink{write(record:Readonly<LogRecord>):void;clearSubject?(subjectRef:string):Promise<void>}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Only category codes, opaque identifiers and bounded metrics cross this boundary.
 * No free-form message/error serialization. A persistent sink must implement purge
 * before it can participate in a successful personal-information deletion. */
export function createLogger(sink:LogSink){
 return {
  write(event:LogEvent,fields:Readonly<Record<string,unknown>>={}):void{
   if(!events.includes(event))throw new Error("INVALID_LOG_EVENT");
   const record:LogRecord={event};
   for(const key of ["requestId","subjectRef","entityId"] as const){const value=fields[key];if(typeof value==="string"&&uuid.test(value))record[key]=value;}
   if(typeof fields.reason==="string"&&reasons.includes(fields.reason as LogReason))record.reason=fields.reason as LogReason;
   for(const key of ["count","durationMs"] as const){const value=fields[key];if(typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER)record[key]=value;}
   if(typeof fields.status==="number"&&Number.isInteger(fields.status)&&fields.status>=100&&fields.status<=599)record.status=fields.status;
   sink.write(Object.freeze(record));
  },
  async clearSubject(subjectRef:string):Promise<void>{
   if(!uuid.test(subjectRef))throw new Error("INVALID_SUBJECT_REF");
   if(!sink.clearSubject)throw new Error("LOG_PURGE_UNAVAILABLE");
   await sink.clearSubject(subjectRef);
  },
 };
}
export type SafeLogger=ReturnType<typeof createLogger>;

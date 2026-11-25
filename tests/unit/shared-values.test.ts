import {describe,it,expect} from "vitest";
import {entityId,owner,sameOwner,revision,nextRevision,assertBaseRevision,quantity,displayDecimal,utcInstant} from "../../src/domain/shared/validation";
const id="8cf0bc94-54ed-48f1-b332-cc4680020626";
describe("shared domain value constraints",()=>{
 it("keeps guest/account namespaces distinct even for identical ID text",()=>{expect(sameOwner(owner("guest",id),owner("account",id))).toBe(false);});
 it("rejects source recipe IDs as internal random identities",()=>{expect(()=>entityId("R001")).toThrow("UUID");});
 it("preserves zero versus unknown quantity",()=>{expect(quantity(null)).toBeNull();expect(quantity("")).toBeNull();expect(quantity("0")?.isZero()).toBe(true);});
 it("rejects estimates, negatives and non-finite values",()=>{for(const value of ["适量","-1","1e3",-1,Infinity,NaN])expect(()=>quantity(value)).toThrow();});
 it("uses decimal arithmetic instead of binary floating rounding",()=>{expect(quantity("0.1")!.plus(quantity("0.2")!).eq("0.3")).toBe(true);});
 it("does not mutate the value when formatting two decimals",()=>{const value=quantity("1.23456")!;expect(displayDecimal(value)).toBe("1.23");expect(value.toString()).toBe("1.23456");});
 it("checks revisions and protects overflow/conflicts",()=>{expect(nextRevision(revision(0))).toBe(1);expect(()=>revision(1.5)).toThrow();expect(()=>nextRevision(revision(Number.MAX_SAFE_INTEGER))).toThrow();expect(()=>assertBaseRevision(revision(1),revision(2))).toThrow("REVISION_CONFLICT");});
 it("normalizes UTC timestamps and rejects invalid or local instants",()=>{expect(utcInstant("2026-11-23T12:00:00Z")).toBe("2026-11-23T12:00:00.000Z");expect(()=>utcInstant("2026-02-30T12:00:00Z")).toThrow();expect(()=>utcInstant("2026-11-23T12:00:00+08:00")).toThrow();});
});

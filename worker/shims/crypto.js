import * as nodeCrypto from "node:crypto";

export default nodeCrypto;
export const createHmac = nodeCrypto.createHmac;
export const createHash = nodeCrypto.createHash;
export const randomBytes = nodeCrypto.randomBytes;
export const timingSafeEqual = nodeCrypto.timingSafeEqual;
export const scryptSync = nodeCrypto.scryptSync;

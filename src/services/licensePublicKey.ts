/**
 * PUBLIC key that checks school licence codes (ECDSA P-256). Written by scripts/license-keygen.cjs.
 * It can only VERIFY codes; the matching private key stays with the author (license-keys/, never committed).
 */
export const LICENSE_PUBLIC_JWK: { kty: string; crv: string; x: string; y: string } | null = {"kty":"EC","crv":"P-256","x":"QVvz1z3XgfTS5clrzF2r7C9l0875ELr5Bxc_qB-Tqpk","y":"7vNT8ckQ13sLLy1VR3X2IVtT7zskxtLX-WEum6WeVpI"};

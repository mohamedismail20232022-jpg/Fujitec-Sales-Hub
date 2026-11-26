'use strict';
// Real dependencies: verify Firebase ID token via Identity Toolkit lookup (uses the PUBLIC web key; no server secret),
// read the caller's role from Firestore REST using the CALLER's token, so the live Firestore rules apply to that read.
const E=process.env;
const AUTH=E.FIREBASE_AUTH_EMULATOR_HOST?'http://'+E.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com':'https://identitytoolkit.googleapis.com';
const FS=E.FIRESTORE_EMULATOR_HOST?'http://'+E.FIRESTORE_EMULATOR_HOST:'https://firestore.googleapis.com';
async function verifyToken(idToken){const key=E.FIREBASE_WEB_API_KEY;if(!key)throw new Error('FIREBASE_WEB_API_KEY not configured');
  const r=await fetch(AUTH+'/v1/accounts:lookup?key='+encodeURIComponent(key),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken})});
  if(!r.ok)throw new Error('token rejected');const j=await r.json();const u=j.users&&j.users[0];if(!u||!u.localId||!u.email||u.disabled)throw new Error('no user');return {uid:u.localId,email:String(u.email).toLowerCase()};}
async function getRole(email,idToken){const p=E.FIREBASE_PROJECT_ID;if(!p)throw new Error('FIREBASE_PROJECT_ID not configured');
  const r=await fetch(FS+'/v1/projects/'+p+'/databases/(default)/documents/ws/main/roles/'+encodeURIComponent(String(email).toLowerCase()),{headers:{authorization:'Bearer '+idToken}});
  if(r.status===404||r.status===403)return null;if(!r.ok)throw new Error('role lookup failed '+r.status);const j=await r.json();const v=j.fields&&j.fields.role&&j.fields.role.stringValue;return v||null;}
const {firestore}=require('./store');
function makeStore(token){return firestore({project:E.FIREBASE_PROJECT_ID,token,host:E.FIRESTORE_EMULATOR_HOST})}
module.exports={verifyToken,getRole,makeStore};

'use client';
import { useEffect, useRef, useState } from 'react';

type CallSession = {
 active:boolean; ws?:WebSocket; pc?:RTCPeerConnection; local?:MediaStream; screen?:MediaStream;
 ice:RTCIceServer[]; token?:string; callId?:string; pending:RTCIceCandidateInit[];
 heartbeat?:ReturnType<typeof setInterval>; refresh?:ReturnType<typeof setInterval>;
 timeout?:ReturnType<typeof setTimeout>; disconnected?:ReturnType<typeof setTimeout>; lastPong:number;
};
function MediaVideo({stream,muted=false,label}:{stream:MediaStream|null;muted?:boolean;label:string}) {
 const ref=useRef<HTMLVideoElement>(null);const [blocked,setBlocked]=useState(false);
 useEffect(()=>{const v=ref.current;if(!v)return;v.srcObject=stream;setBlocked(false);if(stream)v.play().catch(()=>setBlocked(true));return()=>{v.srcObject=null;};},[stream]);
 return <div className="relative overflow-hidden rounded-lg bg-black"><video ref={ref} autoPlay playsInline muted={muted} className="aspect-video max-h-28 w-full object-contain lg:max-h-none"/><span className="absolute bottom-1 left-2 rounded bg-black/70 px-2 text-xs text-white">{label}</span><button type="button" aria-label={`Expand ${label}`} onClick={()=>ref.current?.requestFullscreen?.().catch(()=>{})} className="absolute right-1 top-1 rounded bg-black/60 px-2 py-1 text-xs">Expand</button>{blocked&&<button type="button" onClick={()=>ref.current?.play().then(()=>setBlocked(false))} className="absolute inset-0 bg-black/50 text-white">Click to play call audio/video</button>}</div>;
}
export function VideoCall({room,name}:{room:string;name:string}) {
 const session=useRef<CallSession|null>(null);
 const [active,setActive]=useState(false);const [status,setStatus]=useState('Two people per call. Everyone can still text.');
 const [warning,setWarning]=useState('');const [local,setLocal]=useState<MediaStream|null>(null);const [remote,setRemote]=useState<MediaStream|null>(null);
 const [peerName,setPeerName]=useState('Other participant');const [mic,setMic]=useState(true);const [camera,setCamera]=useState(true);
 const [audioOnly,setAudioOnly]=useState(false);const [sharing,setSharing]=useState(false);const [shareBusy,setShareBusy]=useState(false);
 function dispose(s:CallSession){s.active=false;clearInterval(s.heartbeat);clearInterval(s.refresh);clearTimeout(s.timeout);clearTimeout(s.disconnected);
  try{s.ws?.send(JSON.stringify({type:'leave'}));}catch{}try{s.ws?.close();}catch{}s.pc?.close();s.local?.getTracks().forEach(t=>t.stop());s.screen?.getTracks().forEach(t=>t.stop());
 }
 function end(message='Call ended. Text chat is still open.') {
  if(session.current)dispose(session.current);session.current=null;setActive(false);setLocal(null);setRemote(null);setSharing(false);setShareBusy(false);setStatus(message);
 }
 useEffect(()=>()=>{if(session.current)dispose(session.current);session.current=null;},[]);
 function send(s:CallSession,data:object){if(s.active&&s.ws?.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify({...data,callId:s.callId}));}
 async function ice(s:CallSession) {
  const r=await fetch(`/api/calls/${room}/ice`,{method:'POST',headers:{Authorization:`Bearer ${s.token}`},signal:AbortSignal.timeout(15000)});
  const d=await r.json() as {error?:string;iceServers:RTCIceServer[];relay:boolean};if(!r.ok)throw new Error(d.error||'Could not configure the call connection.');
  if(!s.active)return;s.ice=d.iceServers;s.pc?.setConfiguration({iceServers:s.ice});
  setWarning(d.relay?'':'Relay not configured: direct calls may work, but some networks will not connect.');
 }
 function makePeer(s:CallSession) {
  s.pc?.close();clearTimeout(s.disconnected);clearTimeout(s.timeout);s.pending=[];setRemote(null);
  const pc=new RTCPeerConnection({iceServers:s.ice});s.pc=pc;
  const stream=s.local!;
  const audio=stream.getAudioTracks()[0];if(audio)pc.addTrack(audio,stream);else pc.addTransceiver('audio',{direction:'sendrecv'});
  const video=s.screen?.getVideoTracks()[0]||stream.getVideoTracks()[0];
  if(video)pc.addTrack(video,stream);else pc.addTransceiver('video',{direction:'sendrecv'});
  const incoming=new MediaStream();
  pc.ontrack=e=>{if(!s.active||s.pc!==pc)return;if(!incoming.getTracks().some(t=>t.id===e.track.id))incoming.addTrack(e.track);setRemote(incoming);};
  pc.onicecandidate=e=>{if(e.candidate&&s.pc===pc)send(s,{type:'candidate',candidate:e.candidate.toJSON()});};
  pc.onconnectionstatechange=()=>{if(!s.active||s.pc!==pc)return;
   if(pc.connectionState==='connected'){clearTimeout(s.timeout);clearTimeout(s.disconnected);setStatus('Connected');}
   else if(pc.connectionState==='failed')end('Could not connect. Check relay setup, then join again.');
   else if(pc.connectionState==='disconnected'){setStatus('Connection interrupted…');clearTimeout(s.disconnected);s.disconnected=setTimeout(()=>{if(s.active&&s.pc===pc)end('Connection lost. Join again to reconnect.');},20000);}
  };
  s.timeout=setTimeout(()=>{if(s.active&&s.pc===pc&&pc.connectionState!=='connected')end('The call could not connect. Check relay setup and try again.');},45000);
  return pc;
 }
 async function join(){
  if(session.current)return;
  if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined'){setStatus('This browser needs HTTPS and camera/microphone support.');return;}
  const s:CallSession={active:true,ice:[],pending:[],lastPong:Date.now()};session.current=s;setActive(true);setWarning('');setStatus('Allow microphone'+(audioOnly?'':' and camera')+' access…');setMic(true);setCamera(!audioOnly);
  try {
   const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:audioOnly?false:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}});
   if(!s.active){media.getTracks().forEach(t=>t.stop());return;}s.local=media;setLocal(media);setStatus('Joining video room…');
   const u=new URL(`/api/calls/${room}`,location.href);u.protocol=location.protocol==='https:'?'wss:':'ws:';u.searchParams.set('name',name.trim()||'Guest');
   const ws=new WebSocket(u);s.ws=ws;let queue=Promise.resolve();
   s.timeout=setTimeout(()=>{if(s.active&&!s.token)end('Video connection timed out. Check the Worker deployment and try again.');},20000);
   ws.onmessage=event=>{queue=queue.then(async()=>{
    if(!s.active)return;const d=JSON.parse(event.data);
    if(d.type==='full'){end('Two people are already in this video call. Text chat is still available.');return;}
    if(d.type==='pong'){s.lastPong=Date.now();return;}
    if(d.type==='joined'){
     clearTimeout(s.timeout);s.token=d.token;s.lastPong=Date.now();
     s.heartbeat=setInterval(()=>{if(Date.now()-s.lastPong>90000){end('Connection lost. Join again to reconnect.');return;}send(s,{type:'ping'});},20000);
     try { await ice(s); } catch(error) { if(s.active)end(error instanceof Error?error.message:"Could not configure relay."); return; }
     if(!s.active)return;
     s.refresh=setInterval(()=>{ice(s).catch(()=>{if(s.active)setWarning('Relay credentials could not refresh. Rejoin if the connection drops.');});},30*60*1000);
     send(s,{type:'ready'});setStatus('Waiting for someone to join video in this room…');return;
    }
    if(d.type==='peer-left'){s.pc?.close();s.pc=undefined;s.callId=undefined;s.pending=[];clearTimeout(s.timeout);clearTimeout(s.disconnected);setRemote(null);setStatus('Other participant left. Waiting for someone to join…');return;}
    if(d.type==='start'){
     s.callId=d.callId;setPeerName(d.name||'Other participant');setStatus('Connecting…');const pc=makePeer(s);
     if(d.offerer){await pc.setLocalDescription(await pc.createOffer());if(s.active)send(s,{type:'description',description:pc.localDescription});}return;
    }
    if(!s.pc||d.callId!==s.callId)return;
    if(d.type==='description'){
     await s.pc.setRemoteDescription(d.description);
     for(const candidate of s.pending)await s.pc.addIceCandidate(candidate);s.pending=[];
     if(d.description.type==='offer'){await s.pc.setLocalDescription(await s.pc.createAnswer());send(s,{type:'description',description:s.pc.localDescription});}
    }else if(d.type==='candidate'){if(s.pc.remoteDescription)await s.pc.addIceCandidate(d.candidate);else s.pending.push(d.candidate);}
   }).catch(()=>{if(s.active)end('Could not establish the call. Leave and join again.');});};
   ws.onerror=()=>{if(s.active)end('Video connection failed. Check the Worker deployment and try again.');};
   ws.onclose=()=>{if(s.active)end('Video connection closed. Join again to reconnect.');};
  }catch(error){if(s.active)end(error instanceof DOMException&&error.name==='NotAllowedError'?'Camera or microphone permission denied. Allow access in your browser, then join again.':error instanceof DOMException&&error.name==='NotFoundError'?'No camera or microphone found. Try audio-only if you have a microphone.':'Could not open camera/microphone. Close other apps using them and try again.');}
 }
 async function stopShare(s:CallSession){
  const screen=s.screen;if(!screen)return;s.screen=undefined;screen.getTracks().forEach(t=>{t.onended=null;t.stop();});
  const sender=s.pc?.getTransceivers().find(t=>t.receiver.track.kind==='video')?.sender;
  await sender?.replaceTrack(s.local?.getVideoTracks()[0]||null);
  if(s.active){setLocal(s.local||null);setSharing(false);}
 }
 async function share(){const s=session.current;if(!s?.active||shareBusy)return;setShareBusy(true);
  try{if(s.screen){await stopShare(s);return;}
   if(!navigator.mediaDevices.getDisplayMedia){setWarning('Screen sharing is not supported by this browser.');return;}
   const screen=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});if(!s.active){screen.getTracks().forEach(t=>t.stop());return;}
   s.screen=screen;const track=screen.getVideoTracks()[0];
   const sender=s.pc?.getTransceivers().find(t=>t.receiver.track.kind==='video')?.sender;
   await sender?.replaceTrack(track);track.onended=()=>{stopShare(s).catch(()=>{if(s.active)end('Screen sharing ended. Please rejoin the call.');});};setLocal(screen);setSharing(true);
  }catch(error){if(s.active){if(s.screen)await stopShare(s).catch(()=>{});if(!(error instanceof DOMException&&error.name==='NotAllowedError'))setWarning('Screen sharing failed. Try another screen or window.');}}
  finally{if(s.active)setShareBusy(false);}
 }
 const button='rounded-md border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50';
 return <section aria-label="Video call" className="mb-5 rounded-lg border border-cyan-300/25 bg-slate-950/60 p-3">
  <h2 className="font-bold text-cyan-100">Video call <span className="text-xs font-normal text-slate-400">· 2 people</span></h2>
  <p role="status" className="my-2 text-sm text-slate-300">{status}</p>
  {warning&&<p className="mb-2 text-xs text-amber-200">{warning}</p>}
  {active?<div className="flex flex-col"><div className="order-2 mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">{remote&&<MediaVideo stream={remote} label={peerName}/>}<MediaVideo stream={local} muted label={sharing?'Your screen':'You'}/></div>
   <div className="order-1 mt-3 flex flex-wrap gap-2">
    <button type="button" className={button} aria-pressed={!mic} onClick={()=>{const next=!mic;session.current?.local?.getAudioTracks().forEach(t=>t.enabled=next);setMic(next);}}>{mic?'Mute mic':'Unmute mic'}</button>
    <button type="button" className={button} disabled={!session.current?.local?.getVideoTracks().length} aria-pressed={!camera} onClick={()=>{const next=!camera;session.current?.local?.getVideoTracks().forEach(t=>t.enabled=next);setCamera(next);}}>{camera?'Camera off':'Camera on'}</button>
    <button type="button" className={button} disabled={!local||shareBusy} onClick={share}>{sharing?'Stop sharing':'Share screen'}</button>
    <button type="button" className="rounded-md bg-red-900 px-3 py-2 text-sm text-white" onClick={()=>end()}>Hang up</button>
   </div></div>:<><label className="my-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={audioOnly} onChange={e=>setAudioOnly(e.target.checked)}/>Join without camera</label><button type="button" disabled={!room} onClick={join} className="w-full rounded-md bg-cyan-300 px-3 py-2 font-bold text-slate-950 disabled:opacity-50">Start / join video</button></>}
 </section>;
}

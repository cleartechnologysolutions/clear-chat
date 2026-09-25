'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
export function useMessageSound() {
  const audio=useRef<AudioContext|null>(null);
  const enabledRef=useRef(true);
  const [enabled,setEnabled]=useState(true);
  const [ready,setReady]=useState(false);
  const arm=useCallback(async()=>{
    if(!enabledRef.current)return;
    try {audio.current??=new AudioContext();await audio.current.resume();setReady(audio.current.state==='running');}catch{}
  },[]);
  const play=useCallback(()=>{
    const ctx=audio.current;if(!enabledRef.current||!ctx||ctx.state!=='running')return;
    [740,990].forEach((frequency,index)=>{
      const start=ctx.currentTime+index*0.12;
      const oscillator=ctx.createOscillator();const gain=ctx.createGain();
      oscillator.type='sine';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(0.07,start+0.012);gain.gain.exponentialRampToValueAtTime(0.001,start+0.16);
      oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start);oscillator.stop(start+0.18);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
  },[]);
  const gong=useCallback(()=>{
    const ctx=audio.current;if(!enabledRef.current||!ctx||ctx.state!=='running')return;
    // A louder, decaying metallic chord, kept below clipping even when summed.
    [180,269,421,593,827].forEach((frequency,index)=>{
      const oscillator=ctx.createOscillator();const gain=ctx.createGain();const start=ctx.currentTime;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(frequency*0.985,start+1.8);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(0.19/(1+index*0.6),start+0.008);gain.gain.exponentialRampToValueAtTime(0.0001,start+2.2);
      oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start);oscillator.stop(start+2.25);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
  },[]);
  useEffect(()=>{
    try{enabledRef.current=localStorage.getItem('chat-message-sound')!=='off';setEnabled(enabledRef.current);}catch{}
    const unlock=()=>{void arm();};window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
    return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);void audio.current?.close();audio.current=null;};
  },[arm]);
  async function toggle(){
    if(enabled&&!ready){await arm();play();return;}
    const next=!enabled;enabledRef.current=next;setEnabled(next);
    try{localStorage.setItem('chat-message-sound',next?'on':'off');}catch{}
    if(next){await arm();play();}
  }
  return {enabled,ready,toggle,play,gong};
}

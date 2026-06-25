import { config } from 'dotenv';
config();
import { StorageService } from './apps/api/src/services/storageService';
import fs from 'fs';

async function main() {
  const audioKey = 'voiceovers_audio/76dd023a-7494-48f1-8894-64aa08f5d80b/a50355f3-02e1-4642-9f59-9f6d0e455176.mp3';
  const videoKey = 'voiceovers/76dd023a-7494-48f1-8894-64aa08f5d80b/a50355f3-02e1-4642-9f59-9f6d0e455176.mp4';
  
  const signedAudio = await StorageService.createSignedUrl(audioKey);
  const signedVideo = await StorageService.createSignedUrl(videoKey);
  
  console.log('Signed Audio URL:', signedAudio);
  console.log('Signed Video URL:', signedVideo);
  
  const aRes = await fetch(signedAudio);
  const vRes = await fetch(signedVideo);
  
  fs.writeFileSync('proof_audio.mp3', Buffer.from(await aRes.arrayBuffer()));
  fs.writeFileSync('proof_video.mp4', Buffer.from(await vRes.arrayBuffer()));
  
  console.log('Downloaded proof_audio.mp3 and proof_video.mp4');
}
main().catch(console.error);

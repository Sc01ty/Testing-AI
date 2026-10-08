<?php
declare(strict_types=1);
// Same-origin lobby coordination. Private room files live outside the document root.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json');
function fail(string $message,int $status=400): never { http_response_code($status);echo json_encode(['error'=>$message]);exit; }
function now(): int {return (int)round(microtime(true)*1000);}
function text($v,int $limit): string {if(!is_string($v)||strlen($v)>$limit)fail('Invalid text.');return trim($v);}
if($_SERVER['REQUEST_METHOD']!=='POST')fail('POST required.',405);
if(isset($_SERVER['HTTP_ORIGIN']) && parse_url($_SERVER['HTTP_ORIGIN'],PHP_URL_HOST)!==explode(':',$_SERVER['HTTP_HOST'])[0])fail('Origin not allowed.',403);
$raw=isset($_POST['payload'])?$_POST['payload']:file_get_contents('php://input');if(strlen($raw)>262144)fail('Request too large.',413);$body=json_decode($raw,true);
if(!is_array($body))fail('Invalid request.');
$action=$body['action']??'';
$root=sys_get_temp_dir().'/rbr-rooms-'.substr(hash('sha256',__DIR__),0,16);
if(!is_dir($root)&&!mkdir($root,0700,true))fail('Lobby storage unavailable.',503);
// Bounded opportunistic expiry, never touching files outside this private directory.
foreach(array_slice(glob($root.'/*'),0,100) as $expired){if(preg_match('~/[A-Z2-9]{7}$~',$expired)&&is_dir($expired)&&filemtime($expired)<time()-86400){$cleanup=fopen($expired.'/room.json','c+');if($cleanup&&flock($cleanup,LOCK_EX|LOCK_NB)){foreach(glob($expired.'/*') as $f)if(is_file($f))unlink($f);flock($cleanup,LOCK_UN);fclose($cleanup);@rmdir($expired);}}}
function rate(string $root,string $kind,int $limit): void {
 $path=$root.'/rate-'.hash('sha256',($_SERVER['REMOTE_ADDR']??'local').$kind);$f=fopen($path,'c+');flock($f,LOCK_EX);$r=json_decode(stream_get_contents($f),true)??['since'=>time(),'count'=>0];if($r['since']<time()-3600)$r=['since'=>time(),'count'=>0];$r['count']++;ftruncate($f,0);rewind($f);fwrite($f,json_encode($r));flock($f,LOCK_UN);fclose($f);if($r['count']>$limit)fail('Too many attempts. Try again later.',429);
}
$issued=null;
if($action==='create'){
 rate($root,'create',25);$name=text($body['name']??'',60);if(!$name)fail('Enter your name.');
 do {$alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';$code='';for($i=0;$i<7;$i++)$code.=$alphabet[random_int(0,strlen($alphabet)-1)];$dir=$root.'/'.$code;}while(is_dir($dir));
 if(!mkdir($dir,0700))fail('Could not create a room.',503);
 $issued=bin2hex(random_bytes(32));$r=['code'=>$code,'createdAt'=>now(),'version'=>1,'members'=>[['name'=>$name,'auth'=>hash('sha256',$issued),'seen'=>now(),'ready'=>false],null],'session'=>null,'startAt'=>null,'run'=>0,'signals'=>[[],[]],'captures'=>[null,null]];
 $f=fopen($dir.'/room.json','c+');flock($f,LOCK_EX);$player=0;
}else{
 if($action==='join')rate($root,'join',120);
 $code=strtoupper(text($body['code']??'',7));if(!preg_match('/^[A-Z2-9]{7}$/',$code))fail('Enter a valid seven-character room code.');
 $dir=$root.'/'.$code;if(!is_file($dir.'/room.json'))fail('Room not found or expired.',404);
 $f=fopen($dir.'/room.json','r+');if(!$f||!flock($f,LOCK_EX))fail('Room busy. Retry.',503);$r=json_decode(stream_get_contents($f),true);
 if(!$r||($r['closed']??false)||$r['createdAt']<now()-86400000)fail('This room has expired or was closed.',410);
 if($action==='join'){
  if($r['members'][1])fail('This room is full.',409);$name=text($body['name']??'',60);if(!$name)fail('Enter your name.');$issued=bin2hex(random_bytes(32));$player=1;$r['members'][1]=['name'=>$name,'auth'=>hash('sha256',$issued),'seen'=>now(),'ready'=>false];$r['version']++;if($r['session'])$r['session']['players'][1]=$name;
 }else{
  $token=text($body['token']??'',64);$player=-1;foreach($r['members'] as $i=>$m)if($m&&hash_equals($m['auth'],hash('sha256',$token)))$player=$i;if($player<0)fail('Your room access has expired. Create or join a room.',403);$r['members'][$player]['seen']=now();
 }
}
function host(int $player):void {if($player!==0)fail('Only the host can do that.',403);}
function persist($f,array $r):void {rewind($f);ftruncate($f,0);fwrite($f,json_encode($r,JSON_THROW_ON_ERROR));fflush($f);flock($f,LOCK_UN);fclose($f);}
if($action==='configure'){
 host($player);if($r['startAt']!==null)fail('Finish or reset the current performance first.',409);
 $s=$body['session']??null;$catalogue=json_decode(file_get_contents(__DIR__.'/../beats/catalogue.json'),true);$beat=null;foreach($catalogue as $b)if($b['id']===($s['beatId']??''))$beat=$b;
 if(!$beat||!in_array($s['length']??0,[8,16,32],true)||!in_array($s['style']??'', ['standard','quick'],true))fail('Select an included beat and valid track settings.');
 $bpm=$s['beatGrid']['bpm']??0;$origin=$s['beatGrid']['introOffset']??-1;if(!is_numeric($bpm)||$bpm<40||$bpm>240||!is_numeric($origin)||$origin<0||$origin+$s['length']*240/$bpm>$beat['durationSec'])fail('That length does not fit the beat.');
 $count=$s['style']==='standard'?4:2;if(count($s['turns']??[])!==$s['length']/$count)fail('Invalid turn plan.');
 $s['id']='room-'.$code;$s['mode']='online';$s['roomCode']=$code;$s['players']=[$r['members'][0]['name'],$r['members'][1]['name']??'Waiting for player'];$s['trackName']=text($s['trackName'],80);$s['topic']=text($s['topic'],160);$s['status']='preparing';$s['master']=null;$s['beatGrid']['durationSec']=$beat['durationSec'];$s['beatGrid']['beatsPerBar']=4;
 foreach($s['turns'] as $i=>&$t){$t['index']=$i;$t['player']=$i%2;$t['barStart']=$i*$count;$t['barEnd']=($i+1)*$count;$t['start']=$origin+$i*$count*240/$bpm;$t['end']=$origin+($i+1)*$count*240/$bpm;$t['boundary']=$i&&($t['boundary']??'')==='overlap'?'overlap':'clean';$t['vocalOffset']=$t['boundary']==='overlap'?-60/$bpm:0;$t['lyrics']=array_fill(0,$count,'');$t['take']=null;$t['result']=null;$t['ready']=false;}unset($t);
 $r['session']=$s;$r['captures']=[null,null];foreach($r['members'] as &$m)if($m)$m['ready']=false;unset($m);$r['version']++;
}elseif($action==='lock'){
 $s=&$r['session'];if(!$s||$r['startAt']!==null)fail('This track is not preparing.',409);$index=$body['index']??-1;$first=null;foreach($s['turns'] as $i=>$t)if(!$t['ready']){$first=$i;break;}if($index!==$first||$s['turns'][$index]['player']!==$player)fail('Wait for your own section.',409);
 $lyrics=$body['lyrics']??[];if(count($lyrics)!==count($s['turns'][$index]['lyrics']))fail('Complete every bar.');foreach($lyrics as &$line){$line=text($line,1000);if(!$line)fail('Complete every bar.');}unset($line);$s['turns'][$index]['lyrics']=$lyrics;$s['turns'][$index]['ready']=true;
 if(isset($s['turns'][$index+1])&&isset($body['challenge'])){$c=$body['challenge'];$c['prompt']=text($c['prompt']??'',600);if(!in_array($c['source']??'', ['basic','local-ai'],true))fail('Invalid director response.');$s['turns'][$index+1]['challenge']=$c;}
 $r['version']++;
}elseif($action==='ready'){
 if(!$r['session']||in_array(false,array_column($r['session']['turns'],'ready'),true)||$r['startAt']!==null)fail('Finish preparing your lyrics first.',409);$r['members'][$player]['ready']=true;$r['version']++;
}elseif($action==='start'){
 host($player);if(!$r['session']||!$r['members'][1]||!$r['members'][0]['ready']||!$r['members'][1]['ready']||min($r['members'][0]['seen'],$r['members'][1]['seen'])<now()-10000||$r['startAt']!==null)fail('Both players must be connected and ready.',409);
 $r['run']++;$r['startAt']=now()+6000;$r['captures']=[null,null];$r['session']['status']='preparing';foreach($r['session']['turns'] as &$t){$t['take']=null;$t['result']=null;}unset($t);$r['version']++;
}elseif($action==='reset'){
 host($player);$r['startAt']=null;$r['session']['status']='preparing';foreach($r['members'] as &$m)if($m)$m['ready']=false;unset($m);$r['version']++;
}elseif($action==='leave'){
 if($player===0)$r['closed']=true;else{$r['members'][1]=null;$r['signals']=[[],[]];$r['startAt']=null;if($r['session']){$r['session']['status']='preparing';foreach($r['session']['turns'] as &$t)if($t['player']===1)$t['ready']=false;unset($t);}$r['members'][0]['ready']=false;}$r['version']++;
}elseif($action==='signal'){
 $signal=$body['signal']??null;if(!is_array($signal)||strlen(json_encode($signal))>40000)fail('Invalid voice message.');$r['signals'][1-$player][]=$signal;$r['signals'][1-$player]=array_slice($r['signals'][1-$player],-100);
}elseif($action==='upload'){
 if(!$r['session']||($body['run']??-1)!==$r['run']||!$r['startAt'])fail('This performance is no longer active.',409);
 $file=$_FILES['audio']??null;if(!$file||$file['error']!==UPLOAD_ERR_OK||$file['size']>16000000)fail('Vocal upload failed or was too large. Retry upload.',413);
 $bytes=0;foreach(glob($dir.'/*.wav') as $stored)$bytes+=filesize($stored);if($bytes+$file['size']>100000000)fail('This room has reached its recording limit. Save your track and create a fresh room.',413);
 $head=file_get_contents($file['tmp_name'],false,null,0,12);if(substr($head,0,4)!=='RIFF'||substr($head,8,4)!=='WAVE')fail('Expected a WAV recording.');
 $metadata=$body['take']??null;if(!is_array($metadata)||strlen(json_encode($metadata))>50000||!is_numeric($metadata['beatTimeSec']??null)||!is_numeric($metadata['durationSec']??null)||$metadata['durationSec']<1||$metadata['durationSec']>220)fail('Invalid vocal metadata.');
 $slot=$body['slot']??null;if($slot!==null&&(!is_int($slot)||!isset($r['session']['turns'][$slot])||$r['session']['turns'][$slot]['player']!==$player||$r['session']['status']!=='complete'))fail('You can only retake your own completed section.',403);
 $audioId=bin2hex(random_bytes(12));$metadata['id']='room-'.$code.':'.$audioId;$metadata['beatId']=$r['session']['beatId'];if(!move_uploaded_file($file['tmp_name'],$dir.'/'.$audioId.'.wav'))fail('Could not store vocal audio.',503);
 $scores=$body['results']??[];foreach($r['session']['turns'] as $i=>&$t)if($t['player']===$player&&($slot===null||$slot===$i)){$result=$scores[(string)$i]??null;if(!is_array($result)||!is_numeric($result['score']??null)||$result['score']<0||$result['score']>100)fail('Invalid score.');$t['take']=$metadata;$t['captureId']=$metadata['id'];$t['result']=$result;}unset($t);
 if($slot===null)$r['captures'][$player]=$audioId;if($r['captures'][0]&&$r['captures'][1])$r['session']['status']='complete';$r['session']['updatedAt']=now();$r['version']++;
}elseif($action==='audio'){
 $id=text($body['id']??'',80);$allowed=false;foreach($r['session']['turns']??[] as $t)if(($t['take']['id']??'')===$id)$allowed=true;$file=substr($id,strrpos($id,':')+1);if(!$allowed||!preg_match('/^[a-f0-9]{24}$/',$file)||!is_file($dir.'/'.$file.'.wav'))fail('Recording not found.',404);
 persist($f,$r);header('Content-Type: audio/wav');readfile($dir.'/'.$file.'.wav');exit;
}elseif(!in_array($action,['create','join','poll'],true))fail('Unknown room action.');
$signals=$r['signals'][$player];$r['signals'][$player]=[];
persist($f,$r);
$members=array_map(fn($m)=>$m?['name'=>$m['name'],'ready'=>$m['ready'],'online'=>$m['seen']>now()-12000]:null,$r['members']);
$unchanged=$action==='poll'&&($body['version']??0)===$r['version'];
echo json_encode(['code'=>$code,'player'=>$player,'token'=>$issued,'version'=>$r['version'],'members'=>$members,'session'=>$unchanged?null:$r['session'],'unchanged'=>$unchanged,'startAt'=>$r['startAt'],'run'=>$r['run'],'signals'=>$signals,'now'=>now()],JSON_THROW_ON_ERROR);

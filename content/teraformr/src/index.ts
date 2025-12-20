import { levels } from "./levels";

function lvls(l){return[[''],...levels][l]}
// Uncommenting will break code
var lvl=0,keys=[],carrying=0,p,eros=0,
map,c=document.getElementById('swf');
function M(){lvl++;map=[];for(var i of lvls(lvl))map.push(i.split(''));carrying=0}M()
c.onkeydown = function(evt){
	keys[evt.keyCode||evt.which]=true;
	console.log(evt.keyCode||evt.which)
	if(!keys[116])evt.preventDefault();
}
c.onkeyup = function(evt){
	keys[evt.keyCode||evt.which]=false;
}
function b(y,x,t){return map[p.y-y][p.x+x]==(t||' ')}
function update(){
	for(var i=0;i<map.length;i++)for(var j=0;j<map[i].length;j++)if(map[i][j]=='@')p={y:i,x:j};
	if(p.y+1==map.length||keys[82]){
		lvl--;M()
	} else if(b(-1,0)){
		map[p.y+1][p.x]='@';
		if(carrying){
			map[p.y][p.x]='#';
			map[p.y-1][p.x]=' ';
		} else {
			map[p.y][p.x]=' '
		}
	} else if(b(-1,0,'O')){
		M()
	} else if(carrying){
		if(keys[65]||keys[37]&&!(keys[68]||keys[39])){
			if(b(0,-1,'#')){
				if(b(2,0)&&b(2,-1)&&(b(1,-1)||b(1,-1,'O'))){
					if(b(1,-1,'O')){M()}else{
					map[p.y-1][p.x-1]='@';
					map[p.y-2][p.x-1]='#';
					map[p.y-1][p.x]=' ';
					map[p.y][p.x]=' ';
				}}
			} else if(b(1,-1)){
				if(b(0,-1,'O')){M()}else{
				map[p.y][p.x-1]='@';
				map[p.y-1][p.x-1]='#';
				map[p.y][p.x]=' ';
				map[p.y-1][p.x]=' ';
			}}
		} else if(keys[68]||keys[39]&&!(keys[65]||keys[37])){
			if(b(0,1,'#')){
				if(b(2,0)&&b(2,1)&&(b(1,1)||b(1,1,'O'))){
					if(b(1,1,'O')){M()}else{
					map[p.y-1][p.x+1]='@';
					map[p.y-2][p.x+1]='#';
					map[p.y-1][p.x]=' ';
					map[p.y][p.x]=' ';
				}}
			} else if(b(0,1,'O')){
				M()
			} else if(b(1,1)){
				map[p.y][p.x+1]='@';
				map[p.y-1][p.x+1]='#';
				map[p.y-1][p.x]=' ';
				map[p.y][p.x]=' ';
			}
		} else if(keys[40]||keys[83]){
			carrying=!1;
			map[p.y][p.x]='#';
			map[p.y-1][p.x]='@';
		}
	} else {
		if(keys[65]||keys[37]&&!(keys[68]||keys[39])){ 
			if(b(0,-1,'#')){
				if(((b(1,-1))||b(1,-1,'O'))&&b(1,0)){
					if(b(1,-1,'O')){M()}else{
					map[p.y-1][p.x-1]='@';
					map[p.y][p.x]=' ';
				}}
			} else if(b(0,-1,'O')){
				M()
			} else {
				map[p.y][p.x-1]='@';
				map[p.y][p.x]=' ';
			}
		} else if(keys[68]||keys[39]&&!(keys[65]||keys[37])){
			if(b(0,1,'#')){
				if(((b(1,1))||b(1,1,'O'))&&b(1,0)){
					if(b(1,1,'O')){M()}else{
					map[p.y-1][p.x+1]='@';
					map[p.y][p.x]=' ';
				}}
			} else if(b(0,1,'O')){
				M()
			} else {
				map[p.y][p.x+1]='@';
				map[p.y][p.x]=' ';
			}
		} else if(keys[40]||keys[83]){
			carrying=!0;
			map[p.y][p.x]='#';
			map[p.y+1][p.x]='@';
		}
	}
	c.innerHTML='';
	for(var i of map)c.innerHTML+=i.join('')+'\n';
}
setInterval('update()',123)

// Standard six-row bead plate and big road. These maps describe past hands.
export function buildBaccaratRoads(rounds){
 const counts={player:0,banker:0,tie:0,playerPair:0,bankerPair:0};
 const bead=[],big=[],occupied=new Set();
 let current=null,baseColumn=-1,tail=false,leadingTies=0,leadingPlayerPair=false,leadingBankerPair=false;
 for(const [index,round] of rounds.entries()){
  if(!['player','banker','tie'].includes(round.outcome))throw Error('Unknown baccarat outcome');
  counts[round.outcome]++;if(round.playerPair)counts.playerPair++;if(round.bankerPair)counts.bankerPair++;
  bead.push({column:Math.floor(index/6),row:index%6,type:round.outcome,playerPair:!!round.playerPair,bankerPair:!!round.bankerPair,ties:round.outcome==='tie'?1:0});
  if(round.outcome==='tie'){
   if(current){current.ties++;current.playerPair||=!!round.playerPair;current.bankerPair||=!!round.bankerPair;}
   else{leadingTies++;leadingPlayerPair||=!!round.playerPair;leadingBankerPair||=!!round.bankerPair;}
   continue;
  }
  let column,row;
  if(current?.type===round.outcome){
   column=current.column;row=current.row;
   if(!tail&&row<5&&!occupied.has(column+','+(row+1)))row++;
   else{tail=true;column++;while(occupied.has(column+','+row))column++;}
  }else{baseColumn++;column=baseColumn;row=0;while(occupied.has(column+',0'))column++;baseColumn=column;tail=false;}
  current={column,row,type:round.outcome,playerPair:!!round.playerPair||leadingPlayerPair,bankerPair:!!round.bankerPair||leadingBankerPair,ties:leadingTies};
  leadingTies=0;leadingPlayerPair=false;leadingBankerPair=false;occupied.add(column+','+row);big.push(current);
 }
 if(!big.length&&leadingTies)big.push({column:0,row:0,type:'tie',ties:leadingTies,playerPair:leadingPlayerPair,bankerPair:leadingBankerPair});
 return {bead,big,counts,total:rounds.length};
}

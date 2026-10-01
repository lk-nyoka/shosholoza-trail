/** Overview-scale train: rigid vehicles articulated at couplers, never bent polylines. */
export function overviewConsist(head, pointAlong, metresPerPixel, heading = 1) {
  const cars = ['#8b76b8','#2fa8c6','#ebb937','#7e63a8','#2fa8c6','#ebb937'];
  const features=[];
  const solid=(a,b,width,base,height,color,index)=>{
    const lat=(a[1]+b[1])/2*Math.PI/180,mx=111320*Math.cos(lat),my=110540;
    const dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*my,n=Math.hypot(dx,dy)||1;
    const ox=-dy/n*width*metresPerPixel/2/mx,oy=dx/n*width*metresPerPixel/2/my;
    const ring=[[a[0]+ox,a[1]+oy],[b[0]+ox,b[1]+oy],[b[0]-ox,b[1]-oy],[a[0]-ox,a[1]-oy],[a[0]+ox,a[1]+oy]];
    features.push({type:'Feature',properties:{kind:'solid',base:base*metresPerPixel,height:height*metresPerPixel,color,index},geometry:{type:'Polygon',coordinates:[ring]}});
  };
  const feature=(kind,coordinates,color,index)=>features.push({type:'Feature',properties:{kind,color,index},geometry:{type:'LineString',coordinates}});
  let back=0,previousRear=null;
  for(let index=0;index<cars.length;index++){
    // Running back down the line, the cars trail the other way.
    const length=(index===0?27:25)*metresPerPixel,frontDistance=head-back*heading;
    if(frontDistance<0)break;
    const front=pointAlong(frontDistance).point,rear=pointAlong(Math.max(0,frontDistance-length*heading)).point;
    const lerp=t=>[rear[0]+(front[0]-rear[0])*t,rear[1]+(front[1]-rear[1])*t];
    const latitude=(front[1]+rear[1])/2*Math.PI/180,mx=111320*Math.cos(latitude),my=110540;
    const dx=(front[0]-rear[0])*mx,dy=(front[1]-rear[1])*my,norm=Math.hypot(dx,dy)||1;
    const offset=(p,pixels)=>[p[0]-dy/norm*pixels*metresPerPixel/mx,p[1]+dx/norm*pixels*metresPerPixel/my];
    if(previousRear)feature('coupler',[front,previousRear],'#a8adb0',index);
    feature(index===0?'loco':'coach',[rear,front],cars[index],index);
    solid(rear,front,10,0,1.5,'#26343b',index);
    solid(lerp(.02),lerp(.98),9,1.5,6.8,cars[index],index);
    // Stepped roof shoulders, inset crown and visible end gangways.
    solid(lerp(.06),lerp(.94),8.5,6.8,7.3,'#7c8990',index);
    solid(lerp(.09),lerp(.91),7.2,7.3,7.8,'#c7ced0',index);
    solid(lerp(.12),lerp(.88),5.5,7.8,8.05,'#e0e3df',index);
    if(index>0){
      solid(lerp(.005),lerp(.04),4.3,2,6.3,'#273138',index);
      solid(lerp(.96),lerp(.995),4.3,2,6.3,'#273138',index);
    }
    for(const t of [.22,.77]){
      solid(lerp(t-.055),lerp(t+.055),10.2,.15,1.65,'#182027',index);
      for(const side of [-1,1]){
        // Axle highlights rotate with distance travelled, not elapsed time.
        // Pausing playback therefore stops this motion too.
        const phase=head/(metresPerPixel*1.6)+t*8;
        const spin=.023*Math.cos(phase),rise=.35*Math.sin(phase);
        solid(offset(lerp(t-.026),side*5.15),offset(lerp(t+.026),side*5.15),.3,.15,1.7,'#10171b',index);
        solid(offset(lerp(t-spin),side*5.34),offset(lerp(t+spin+.002),side*5.34),.12,.75+rise,1.05+rise,'#a0a9ac',index);
      }
    }
    for(const side of [-1,1]){
      const edge=t=>offset(lerp(t),side*4.56);
      solid(edge(.05),edge(.95),.16,2.15,2.5,'#f7d780',index);
      if(index===0){
        solid(edge(.73),edge(.89),.18,4.5,6.45,'#142d3d',index);
        solid(edge(.76),edge(.79),.2,5.8,6.35,'#86bbc6',index);
        for(let vent=0;vent<6;vent++)solid(edge(.18+vent*.065),edge(.20+vent*.065),.18,3.5,5.7,'#514768',index);
      }else{
        solid(edge(.13),edge(.87),.13,4.05,6.25,'#34464e',index);
        for(let window=0;window<7;window++){
          const t=.16+window*.1;
          solid(edge(t),edge(t+.064),.2,4.3,6.05,'#112d3a',index);
          solid(edge(t+.005),edge(t+.059),.22,5.65,5.95,'#89bac7',index);
        }
        for(const t of [.075,.90])solid(edge(t),edge(t+.032),.19,2.65,6.15,'#63737d',index);
      }
    }
    if(index===0){
      // Cab face, split windshield, yellow warning panel and raised roof gear.
      solid(lerp(.963),lerp(.982),7.5,4.7,6.45,'#16333f',index);
      solid(lerp(.96),lerp(.986),.35,4.6,6.6,'#c2b3d7',index);
      solid(lerp(.982),front,8.4,2.3,3.5,'#f4c64c',index);
      solid(lerp(.983),front,3.7,3.8,4.4,'#fff2c4',index);
      solid(lerp(.20),lerp(.36),5.1,8.05,8.4,'#515d64',index);
      solid(offset(lerp(.43),-2),lerp(.56),.4,8.05,8.85,'#273139',index);
      solid(lerp(.56),offset(lerp(.43),2),.4,8.05,8.85,'#273139',index);
      solid(offset(lerp(.56),-2.5),offset(lerp(.56),2.5),.45,8.85,9.15,'#a8b2b5',index);
    }
    previousRear=rear;back+=length+3*metresPerPixel;
  }
  features.push({type:'Feature',properties:{kind:'headlight'},geometry:{type:'Point',coordinates:pointAlong(head).point}});
  return features;
}

// Generate pose frames from the saved cutout. Coordinates follow the opaque
// subject, so a small pet and a tightly cropped portrait keep their own anchor.
function photoPoses(image){
  const width=192,height=208
  const source=document.createElement('canvas')
  source.width=width;source.height=height
  const dc=source.getContext('2d',{willReadFrequently:true})
  dc.drawImage(image,0,0,width,height)
  const original=dc.getImageData(0,0,width,height).data
  let left=width,right=-1,top=height,bottom=-1
  const centers=new Float32Array(height)
  for(let y=0;y<height;y++){
    let sum=0,count=0
    for(let x=0;x<width;x++){
      if(original[(y*width+x)*4+3]<24)continue
      sum+=x;count++
      left=Math.min(left,x);right=Math.max(right,x)
      top=Math.min(top,y);bottom=Math.max(bottom,y)
    }
    centers[y]=count?sum/count:NaN
  }
  const w=Math.max(1,right-left+1),h=Math.max(1,bottom-top+1),cx=(left+right)/2
  const frames=new Map()
  function smooth(n){const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)}
  const poses={
    // Head turn, chest expansion, nod, alternating lower-body steps.
    idle:[.014,.016,.010,0],walk:[.033,.014,.025,.065],
    doze:[.010,.027,.020,0],stretch:[.015,.045,.048,0],
    look:[.075,.010,.012,0],bored:[.030,.010,.025,0],
    sneeze:[.026,.025,.042,0],sway:[.048,.018,.016,.012],
    nod:[.013,.021,.050,0],hop:[.020,.035,.032,.040],
    greet:[.052,.022,.026,0]
  }
  return (pose,tick)=>{
    const index=tick%8,key=pose+index
    if(frames.has(key))return frames.get(key)
    if(right<left)return source
    const [turn,breath,nod,stride]=poses[pose]||poses.idle
    const phase=index*Math.PI/4,sin=Math.sin(phase),rise=(1-Math.cos(phase))/2
    const out=document.createElement('canvas')
    out.width=width;out.height=height
    const c=out.getContext('2d'),frame=c.createImageData(width,height),dest=frame.data
    for(let y=0;y<height;y++){
      const v=(y-top)/h, head=1-smooth((v-.16)/.39),feet=smooth((v-.62)/.35)
      const chest=Math.exp(-Math.pow((v-.56)/.23,2))
      const mid=Number.isFinite(centers[y])?cx*.7+centers[y]*.3:cx
      const scale=1+breath*rise*chest-.024*Math.abs(sin)*head
      for(let x=0;x<width;x++){
        const u=(x-mid)/w
        const side=Math.max(-1,Math.min(1,u*4))
        const sx=mid+(x-mid)/scale-w*sin*(turn*head+stride*feet*side*.38)
        const sy=y+h*(nod*rise*head+u*turn*sin*head+stride*sin*feet*side)
        const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy
        if(ix<0 || ix>=width-1 || iy<0 || iy>=height-1)continue
        const base=4*(iy*width+ix),lower=base+width*4
        const a=(1-fx)*(1-fy)*original[base+3],b=fx*(1-fy)*original[base+7]
        const d=(1-fx)*fy*original[lower+3],e=fx*fy*original[lower+7]
        const alpha=a+b+d+e
        if(alpha<.5)continue
        const j=4*(y*width+x);dest[j+3]=alpha
        for(let k=0;k<3;k++)dest[j+k]=(a*original[base+k]+b*original[base+k+4]+d*original[lower+k]+e*original[lower+k+4])/alpha
      }
    }
    c.putImageData(frame,0,0)
    frames.set(key,out)
    return out
  }
}

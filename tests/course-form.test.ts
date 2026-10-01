import { describe,it,expect } from 'vitest';
import { parseCoordinatePair } from '../src/shared/course-form';
import { validateCourse } from '../src/shared/validation';

describe('course configuration',()=>{
  it.each(['0, 0','0，0','0 0'])('accepts a coordinate pair pasted as %s',value=>{
    expect(parseCoordinatePair(value)).toEqual({latitude:0,longitude:0});
  });
  it('accepts geographic boundaries and rejects malformed or out-of-range coordinates',()=>{
    const point=parseCoordinatePair('-90 180');expect(point.latitude).toBe(-90);expect(point.longitude).toBe(180);
    for(const value of ['','0','0, 0, 0','text, 0','91, 0','0, 181'])expect(()=>parseCoordinatePair(value)).toThrow();
  });
  it('returns field guidance and preserves named locations',()=>{
    const course={id:'11111111-1111-4111-8111-111111111111',remoteId:'demo',name:'示例课程',url:'https://student.iclicker.com/#/course/demo/overview',latitude:0,longitude:0,accuracy:10,mode:'notify',durationMinutes:75,locationName:'示例教室'};
    expect(validateCourse(course,'https://student.iclicker.com').locationName).toBe('示例教室');
    expect(()=>validateCourse({...course,name:''},'https://student.iclicker.com')).toThrow('课程名称');
    expect(()=>validateCourse({...course,durationMinutes:0},'https://student.iclicker.com')).toThrow('1 到 720');
  });
});

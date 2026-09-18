import { describe, it, expect } from 'vitest';
import {
  withOrgParam, courseEditorHref, answersHref, learnCourseHref, learnTopicHref, generateForBlockHref,
  neighbours, lessonBlockFromSearch,
} from '@/lib/lms/links';

const ID = '11111111-2222-3333-4444-555555555555';

describe('адреса кабинетов', () => {
  it('параметр организации дописывается к любому адресу', () => {
    expect(withOrgParam('/org/groups', 'sch12')).toBe('/org/groups?org=sch12');
    expect(withOrgParam('/org?x=1', 'a b')).toBe('/org?x=1&org=a%20b');
    expect(withOrgParam('/org', null)).toBe('/org');
  });
  it('курс, ответы, ученик, мастерская', () => {
    expect(courseEditorHref('c1')).toBe('/teach/courses/c1');
    expect(courseEditorHref('c1', 't1')).toBe('/teach/courses/c1?topic=t1');
    expect(answersHref('c1', 'b1')).toBe('/teach/courses/c1/answers/b1');
    expect(answersHref('c1', 'b1', { pending: true, s: 's1' })).toBe('/teach/courses/c1/answers/b1?pending=1&s=s1');
    expect(learnCourseHref('c1', true)).toBe('/learn/courses/c1?preview=1');
    expect(learnTopicHref('t1', false)).toBe('/learn/topics/t1');
    expect(generateForBlockHref(ID)).toBe(`/?returnTo=${ID}`);
  });
  it('соседи в списке ответов', () => {
    expect(neighbours(['a', 'b', 'c'], 'b')).toEqual({ prev: 'a', next: 'c' });
    expect(neighbours(['a', 'b'], 'a')).toEqual({ prev: null, next: 'b' });
    expect(neighbours(['a', 'b'], undefined)).toEqual({ prev: null, next: 'a' });
    expect(neighbours([], 'x')).toEqual({ prev: null, next: null });
  });
  it('returnTo принимает только uuid', () => {
    expect(lessonBlockFromSearch(ID.toUpperCase())).toBe(ID);
    expect(lessonBlockFromSearch('https://evil.example')).toBeNull();
    expect(lessonBlockFromSearch(null)).toBeNull();
  });
});

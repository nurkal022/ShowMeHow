import { describe, it, expect } from 'vitest';
import { voiceErrorText } from '@/components/useVoiceInput';

describe('voiceErrorText', () => {
  it('переводит коды Web Speech API в понятные фразы', () => {
    expect(voiceErrorText('not-allowed')).toBe('Нет доступа к микрофону');
    expect(voiceErrorText('service-not-allowed')).toBe('Нет доступа к микрофону');
    expect(voiceErrorText('no-speech')).toContain('Не расслышал');
    expect(voiceErrorText('audio-capture')).toBe('Микрофон не найден');
    expect(voiceErrorText('network')).toContain('без сети');
  });

  it('на незнакомый код даёт общий текст, а не пустую строку', () => {
    expect(voiceErrorText('aborted')).toBe('Не удалось распознать речь');
  });
});

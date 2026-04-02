import type {StylePreset} from '../types';

export const getThemeByStyle = (style: StylePreset) => {
  switch (style) {
    case 'luxury':
      return {
        accent: '#d7b56d',
        background: '#0f0f10',
        text: '#ffffff',
        overlay: 'rgba(0,0,0,0.38)'
      };
    case 'modern':
      return {
        accent: '#3aa9ff',
        background: '#101828',
        text: '#ffffff',
        overlay: 'rgba(16,24,40,0.34)'
      };
    case 'energetic':
      return {
        accent: '#ff6b35',
        background: '#121212',
        text: '#ffffff',
        overlay: 'rgba(0,0,0,0.28)'
      };
    case 'minimal':
    default:
      return {
        accent: '#ffffff',
        background: '#111111',
        text: '#ffffff',
        overlay: 'rgba(0,0,0,0.24)'
      };
  }
};

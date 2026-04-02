import type {Platform} from '../types';

export const getPlatformDimensions = (platform: Platform) => {
  switch (platform) {
    case 'tiktok':
    case 'instagram-reel':
    case 'facebook-reel':
      return {width: 1080, height: 1920};
    case 'facebook-feed':
      return {width: 1080, height: 1350};
    case 'square':
      return {width: 1080, height: 1080};
    default:
      return {width: 1080, height: 1920};
  }
};

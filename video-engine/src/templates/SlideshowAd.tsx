import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame
} from 'remotion';
import type {PlannedVideo} from '../types';
import {ImageSlide} from '../components/ImageSlide';
import {TextOverlay} from '../components/TextOverlay';
import {LogoOverlay} from '../components/LogoOverlay';
import {getThemeByStyle} from '../utils/theme';

/** Resolve asset src: URLs pass through, local filenames use staticFile() */
const resolveSrc = (src: string): string => {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src;
  return staticFile(src);
};

export const SlideshowAd: React.FC<{video: PlannedVideo}> = ({video}) => {
  const frame = useCurrentFrame();
  const theme = getThemeByStyle(video.input.style);
  const accent = video.input.themeColor ?? theme.accent;
  const textColor = video.input.textColor ?? theme.text;
  const backgroundColor = video.input.backgroundColor ?? theme.background;
  const overlay = theme.overlay;
  const rtl = video.input.rtl ?? ['he', 'ar'].includes(video.input.language);
  const preset = video.input.preset;

  // Audio: use preset fade settings if available
  const musicVolume = preset?.audio?.musicVolume ?? video.input.music?.volume ?? 0.7;
  const fadeInFrames = preset?.audio?.fadeInFrames ?? 20;
  const fadeOutFrames = preset?.audio?.fadeOutFrames ?? 20;
  const audioFade = interpolate(
    frame,
    [0, fadeInFrames, video.totalFrames - fadeOutFrames, video.totalFrames],
    [0, musicVolume, musicVolume, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Intro text sizes from preset
  const introTitleSize = preset?.text?.headlineFontSize ?? 80;
  const introSubSize = preset?.text?.subheadlineFontSize ?? 34;
  const outroTitleSize = preset?.text?.headlineFontSize ? Math.round(preset.text.headlineFontSize * 0.88) : 70;
  const outroSubSize = preset?.text?.subheadlineFontSize ?? 32;
  const fontFamily = preset?.text?.fontFamily ?? 'Noto Sans Hebrew, Noto Sans, sans-serif';

  // Logo overlay settings
  const logoOpacity = preset?.overlay?.logoOpacity ?? 1;
  const logoWidth = preset?.overlay?.logoWidth ?? video.input.logo?.width;

  return (
    <AbsoluteFill style={{backgroundColor}}>
      {video.input.music ? <Audio src={resolveSrc(video.input.music.src)} volume={audioFade} /> : null}

      <Series>
        {video.scenes.map((scene, index) => {
          if (scene.type === 'intro') {
            const introSrc = scene.image ? resolveSrc(scene.image.src) : null;
            return (
              <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
                <AbsoluteFill style={{backgroundColor}}>
                  {introSrc ? <ImageSlide src={introSrc} fitMode={video.input.fitMode ?? 'cover'} overlay="rgba(0,0,0,0.55)" /> : null}
                  <AbsoluteFill
                    style={{
                      justifyContent: 'center',
                      alignItems: rtl ? 'flex-end' : 'flex-start',
                      padding: '0 72px'
                    }}
                    dir={rtl ? 'rtl' : 'ltr'}
                  >
                    <div style={{maxWidth: '82%', textAlign: rtl ? 'right' : 'left', fontFamily}}>
                      <div style={{fontSize: introTitleSize, color: textColor, fontWeight: 800, lineHeight: 1.02, textShadow: '0 6px 24px rgba(0,0,0,0.7)'}}>{video.input.title}</div>
                      {video.input.subtitle ? (
                        <div style={{marginTop: 22, fontSize: introSubSize, lineHeight: 1.35, color: textColor, opacity: 0.95, textShadow: '0 4px 16px rgba(0,0,0,0.6)'}}>
                          {video.input.subtitle}
                        </div>
                      ) : null}
                    </div>
                  </AbsoluteFill>
                </AbsoluteFill>
              </Series.Sequence>
            );
          }

          if (scene.type === 'outro') {
            const outroSrc = scene.image ? resolveSrc(scene.image.src) : null;
            return (
              <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
                <AbsoluteFill style={{backgroundColor}}>
                  {outroSrc ? <ImageSlide src={outroSrc} fitMode={video.input.fitMode ?? 'cover'} overlay="rgba(0,0,0,0.6)" /> : null}
                  <AbsoluteFill
                    style={{
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: '0 72px'
                    }}
                    dir={rtl ? 'rtl' : 'ltr'}
                  >
                    <div style={{textAlign: 'center', maxWidth: '86%', fontFamily}}>
                      <div style={{fontSize: outroTitleSize, lineHeight: 1.06, color: textColor, fontWeight: 800, textShadow: '0 6px 24px rgba(0,0,0,0.7)'}}>
                        {video.input.outroTitle ?? video.input.cta ?? ''}
                      </div>
                      {video.input.outroSubtitle ? (
                        <div style={{marginTop: 20, fontSize: outroSubSize, color: textColor, opacity: 0.95, lineHeight: 1.35, textShadow: '0 4px 16px rgba(0,0,0,0.6)'}}>
                          {video.input.outroSubtitle}
                        </div>
                      ) : null}
                    </div>
                  </AbsoluteFill>
                </AbsoluteFill>
              </Series.Sequence>
            );
          }

          return (
            <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
              <AbsoluteFill>
                <ImageSlide src={resolveSrc(scene.image!.src)} fitMode={video.input.fitMode ?? 'cover'} overlay={overlay} />
                <TextOverlay
                  title={index === 1 ? video.input.title : scene.image?.caption ?? video.input.title}
                  subtitle={index === 1 ? video.input.subtitle : undefined}
                  cta={index === video.scenes.length - 2 ? video.input.cta : undefined}
                  accent={accent}
                  textColor={textColor}
                  rtl={rtl}
                  preset={preset}
                />
                {video.input.logo ? (
                  <LogoOverlay
                    src={resolveSrc(video.input.logo.src)}
                    width={logoWidth}
                    position={video.input.logo.position}
                    opacity={logoOpacity}
                  />
                ) : null}
              </AbsoluteFill>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};

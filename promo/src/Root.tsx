import React from 'react';
import { Composition } from 'remotion';

import { KronosPromo } from './KronosPromo';
import { DURATION, FPS, HEIGHT, WIDTH } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="KronosPromo"
      component={KronosPromo}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: true }}
    />
  </>
);

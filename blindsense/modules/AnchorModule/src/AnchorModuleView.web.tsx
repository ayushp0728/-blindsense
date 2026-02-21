import * as React from 'react';

import { AnchorModuleViewProps } from './AnchorModule.types';

export default function AnchorModuleView(props: AnchorModuleViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}

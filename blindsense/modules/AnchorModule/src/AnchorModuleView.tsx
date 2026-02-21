import { requireNativeView } from 'expo';
import * as React from 'react';

import { AnchorModuleViewProps } from './AnchorModule.types';

const NativeView: React.ComponentType<AnchorModuleViewProps> =
  requireNativeView('AnchorModule');

export default function AnchorModuleView(props: AnchorModuleViewProps) {
  return <NativeView {...props} />;
}

import { NativeModule, requireNativeModule } from 'expo';

import { AnchorModuleEvents } from './AnchorModule.types';

declare class AnchorModule extends NativeModule<AnchorModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<AnchorModule>('AnchorModule');

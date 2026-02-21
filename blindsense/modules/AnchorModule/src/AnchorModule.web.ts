import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './AnchorModule.types';

type AnchorModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class AnchorModule extends NativeModule<AnchorModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(AnchorModule, 'AnchorModule');

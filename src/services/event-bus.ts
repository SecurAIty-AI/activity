/**
 * @file event-bus.ts — Simple typed event emitter for real-time activity streaming
 */

import { EventEmitter } from 'events';

class ActivityEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

export const eventBus = new ActivityEventBus();

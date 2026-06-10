import { EventEmitter } from 'events';

class MessageEventEmitter extends EventEmitter {}

export const messageEventEmitter = new MessageEventEmitter();

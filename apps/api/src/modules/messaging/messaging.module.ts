import { Module } from "@nestjs/common";

import { MessagingService } from "./messaging.service.js";
import { MESSAGE_PUBLISHER } from "./messaging.tokens.js";

@Module({
  providers: [
    MessagingService,
    {
      provide: MESSAGE_PUBLISHER,
      useExisting: MessagingService
    }
  ],
  exports: [MessagingService, MESSAGE_PUBLISHER]
})
export class MessagingModule {}

import { ApiProperty } from "@nestjs/swagger";
import { EventStatus, RegistrationStatus } from "@prisma/client/index";

export class EventResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  workspaceId!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  slug!: string;

  @ApiProperty({ enum: EventStatus })
  status!: EventStatus;

  @ApiProperty({ type: Date })
  startsAt!: Date;

  @ApiProperty({ type: String })
  timezone!: string;

  @ApiProperty({ type: Number })
  capacity!: number;
}

export class EventRegistrationResponseDto {
  @ApiProperty({ type: Boolean })
  created!: boolean;

  @ApiProperty({ type: String })
  registrationId!: string;

  @ApiProperty({ type: String })
  leadId!: string;

  @ApiProperty({ enum: RegistrationStatus })
  status!: RegistrationStatus;
}

import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export class BookMeetingDto {
  @IsString() @IsNotEmpty() registrationId!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) timezone!: string;
  @IsOptional() @IsString() @MaxLength(80) provider?: string;
  @IsOptional() @IsString() @MaxLength(240) providerMeetingId?: string;
  @IsOptional() @IsUrl() @MaxLength(500) bookingUrl?: string;
}

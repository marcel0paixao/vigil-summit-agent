import { InterestSignalSource } from "@prisma/client/index";
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class RecordInterestDto {
  @IsString() @IsNotEmpty() registrationId!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) kind!: string;
  @IsString() @IsNotEmpty() @MaxLength(240) value!: string;
  @IsOptional() @IsEnum(InterestSignalSource) source?: InterestSignalSource;
  @IsOptional() @IsNumber() @Min(0) @Max(1) confidence?: number;
}

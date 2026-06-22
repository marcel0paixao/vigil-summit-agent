import { IsEnum } from "class-validator";
import { RegistrationStatus } from "@prisma/client/index";

export class UpdateRegistrationStatusDto {
  @IsEnum(RegistrationStatus) status!: RegistrationStatus;
}

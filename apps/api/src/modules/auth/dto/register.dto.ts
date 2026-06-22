import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "owner@acme.test" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Acme Owner" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName!: string;

  @ApiProperty({ example: "correct horse battery staple" })
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;
}

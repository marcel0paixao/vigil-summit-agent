import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client/index";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { appConfig } from "../config/app.config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateCredentialDto } from "./dto/create-credential.dto.js";

@Injectable()
export class CredentialsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(workspaceId: string, actorUserId: string, dto: CreateCredentialDto) {
    const encrypted = encryptCredential(dto.value);

    try {
      const credential = await this.prisma.integrationCredential.create({
        data: {
          workspaceId,
          createdByUserId: actorUserId,
          name: dto.name,
          type: dto.type,
          kind: dto.kind,
          capabilities: dto.capabilities,
          encryptedValue: encrypted.encryptedValue,
          iv: encrypted.iv,
          authTag: encrypted.authTag
        }
      });

      return toCredentialResponse(credential);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Credential name already exists for this credential type");
      }

      throw error;
    }
  }

  async findAllForWorkspace(workspaceId: string) {
    const credentials = await this.prisma.integrationCredential.findMany({
      where: {
        workspaceId
      },
      orderBy: [
        {
          type: "asc"
        },
        {
          name: "asc"
        }
      ]
    });

    return credentials.map(toCredentialResponse);
  }

  async remove(workspaceId: string, credentialId: string) {
    const deleted = await this.prisma.integrationCredential.deleteMany({
      where: {
        id: credentialId,
        workspaceId
      }
    });

    if (deleted.count === 0) {
      throw new NotFoundException("Credential not found");
    }

    return {
      id: credentialId,
      deleted: true
    };
  }

  async findSecret(workspaceId: string, credentialId: string) {
    const credential = await this.prisma.integrationCredential.findFirst({
      where: {
        id: credentialId,
        workspaceId
      }
    });

    if (!credential) {
      throw new NotFoundException("Credential not found");
    }

    return {
      id: credential.id,
      workspaceId: credential.workspaceId,
      type: credential.type,
      kind: credential.kind,
      capabilities: credential.capabilities,
      value: decryptCredential({
        encryptedValue: credential.encryptedValue,
        iv: credential.iv,
        authTag: credential.authTag
      })
    };
  }
}

function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64")
  };
}

function getEncryptionKey() {
  return createHash("sha256").update(appConfig.credentialEncryptionKey).digest();
}

function decryptCredential(encrypted: {
  encryptedValue: string;
  iv: string;
  authTag: string;
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encrypted.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedValue, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function toCredentialResponse(credential: CredentialRecord) {
  return {
    id: credential.id,
    workspaceId: credential.workspaceId,
    name: credential.name,
    type: credential.type,
    kind: credential.kind,
    capabilities: credential.capabilities,
    lastUsedAt: credential.lastUsedAt,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt
  };
}

type CredentialRecord = {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  kind: string;
  capabilities: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

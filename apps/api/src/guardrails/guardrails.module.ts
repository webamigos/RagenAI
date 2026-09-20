import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { SecurityModule } from '../security/security.module.js';
import { GuardrailsService } from './guardrails.service.js';
import { PolicyJudgeService } from './policy-judge.service.js';
import { RunInputGuardrailsService } from './run-input-guardrails.service.js';

/**
 * The loader and the binding, exported together.
 *
 * A consumer needs both: one to read an organization's rules, the other to
 * evaluate them. Exporting only the loader would let a caller fetch rules and
 * then decide for itself what to do with them, which is how the two runtimes
 * come to disagree.
 */
@Module({
  imports: [PrismaModule, SecurityModule],
  providers: [GuardrailsService, PolicyJudgeService, RunInputGuardrailsService],
  exports: [GuardrailsService, RunInputGuardrailsService],
})
export class GuardrailsModule {}

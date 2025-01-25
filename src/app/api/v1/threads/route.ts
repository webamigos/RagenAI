import { NextRequest, NextResponse } from 'next/server';
import { ApiKeysService } from '../logic/services/api-keys.service';
import { KeyId, OrgId, ProjectId } from '../logic/types/brand';
import {
  canActivate,
  UnauthorizedException,
} from '../logic/guards/api-key.guard';

export const GET = async (request: NextRequest) => {
  try {
    const { orgId, projectId, keyId } = await canActivate(request);

    return NextResponse.json({ orgId, projectId, keyId });
  } catch (err) {
    if (err instanceof UnauthorizedException) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
  }
};

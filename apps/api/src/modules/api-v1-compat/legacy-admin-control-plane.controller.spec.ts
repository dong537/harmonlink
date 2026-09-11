import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { LegacyAdminControlPlaneController } from './legacy-admin-control-plane.controller';
import { ApiV1CompatModule } from './api-v1-compat.module';

const adminContext: AuthenticatedContext = {
  ownerId: 'admin-1',
  ownerType: 'PLATFORM_ADMIN',
  siteId: 'site-1',
  tenantId: null,
  scopes: [],
  requestId: 'request-1',
};

function createController() {
  const config = {
    get: (key: string) => ({
      LEGACY_API_V1_ENABLED: 'true',
      LEGACY_API_SITE_ID: 'site-1',
    } as Record<string, string>)[key],
  };
  return new LegacyAdminControlPlaneController(config as never);
}

describe('legacy admin control-plane compatibility surface', () => {
  it('registers a dedicated controller for the frozen XUI/control-plane routes', () => {
    const controllers = Reflect.getMetadata('controllers', ApiV1CompatModule) as unknown[];

    expect(controllers.map((controller) => (controller as { name: string }).name)).toContain(
      'LegacyAdminControlPlaneController',
    );
  });

  it('returns a typed unsupported capability for the frozen XUI node list', async () => {
    const controller = createController();

    await expect(Promise.resolve().then(() => controller.listXuiNodes(adminContext))).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
      reasonKey: 'legacy_xui_nodes_unavailable',
    });
  });

  it('returns typed unsupported capability for every legacy control-plane resource family', async () => {
    const controller = createController();
    const requests = [
      () => controller.createXuiNode(adminContext, {}),
      () => controller.bulkImportXuiNodes(adminContext, {}),
      () => controller.updateXuiNode(adminContext, 'node-1', {}),
      () => controller.deleteXuiNode(adminContext, 'node-1'),
      () => controller.listXuiNodeMappings(adminContext, 'node-1'),
      () => controller.listXuiNodeInbounds(adminContext, 'node-1'),
      () => controller.listXuiNodeRebindCandidates(adminContext, 'line-1', {}),
      () => controller.rebindXuiNodeProxy(adminContext, 'line-1', {}),
      () => controller.testXuiNodeConnection(adminContext, 'node-1'),
      () => controller.getXuiNodeStats(adminContext, 'node-1'),
      () => controller.listEntryProfiles(adminContext),
      () => controller.createEntryProfile(adminContext, {}),
      () => controller.checkEntryProfile(adminContext, 'profile-1'),
      () => controller.listEntryDeviceGroups(adminContext),
      () => controller.createEntryDeviceGroup(adminContext, {}),
      () => controller.listExternalForwardRules(adminContext),
      () => controller.createExternalForwardRule(adminContext, {}),
      () => controller.listRelayDeploymentSets(adminContext),
      () => controller.createRelayDeploymentSet(adminContext, {}),
      () => controller.listDeliveryProfiles(adminContext),
      () => controller.createDeliveryProfile(adminContext, {}),
      () => controller.listDeliveryPolicyBindings(adminContext),
      () => controller.createDeliveryPolicyBinding(adminContext, {}),
    ];

    const errors = await Promise.all(requests.map((request) => Promise.resolve().then(request).catch((error: unknown) => error)));
    expect(errors).toHaveLength(23);
    for (const error of errors) {
      expect(error).toMatchObject({
        code: 'UNSUPPORTED_CAPABILITY',
        httpStatus: 501,
        reasonKey: 'legacy_control_plane_unavailable',
      });
    }
  });

  it('checks the legacy feature gate and site before reporting unsupported capability', async () => {
    const disabled = new LegacyAdminControlPlaneController({ get: () => 'false' } as never);
    await expect(Promise.resolve().then(() => disabled.listXuiNodes(adminContext))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      httpStatus: 404,
      reasonKey: 'legacy_api_disabled',
    });

    const wrongSite = createController();
    await expect(Promise.resolve().then(() => wrongSite.listXuiNodes({ ...adminContext, siteId: 'site-2' }))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
  });

  it('rejects non-admin callers before unsupported capability resolution', async () => {
    const controller = createController();
    await expect(Promise.resolve().then(() => controller.listXuiNodes({ ...adminContext, ownerType: 'USER' }))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'insufficient_permissions',
    });
  });
});

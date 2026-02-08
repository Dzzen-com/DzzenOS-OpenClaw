import { lazy } from 'react';
import { FuseRouteItemType } from '@fuse/utils/FuseUtils';

const OpenClawSettingsView = lazy(() => import('./components/views/OpenClawSettingsView'));

const route: FuseRouteItemType = {
	path: 'openclaw-settings',
	element: <OpenClawSettingsView />
};

export default route;

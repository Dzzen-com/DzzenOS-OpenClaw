import { lazy } from 'react';
import { FuseRouteItemType } from '@fuse/utils/FuseUtils';

const WorkspaceView = lazy(() => import('./components/views/WorkspaceView'));

const route: FuseRouteItemType = {
	path: 'workspace',
	element: <WorkspaceView />
};

export default route;

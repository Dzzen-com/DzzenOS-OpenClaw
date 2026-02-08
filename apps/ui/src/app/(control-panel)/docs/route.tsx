import { lazy } from 'react';
import { FuseRouteItemType } from '@fuse/utils/FuseUtils';

const DocsView = lazy(() => import('./components/views/DocsView'));

const route: FuseRouteItemType = {
	path: 'docs',
	element: <DocsView />
};

export default route;

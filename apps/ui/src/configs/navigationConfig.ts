import i18n from '@i18n';
import { FuseNavItemType } from '@fuse/core/FuseNavigation/types/FuseNavItemType';
import ar from './navigation-i18n/ar';
import en from './navigation-i18n/en';
import tr from './navigation-i18n/tr';

i18n.addResourceBundle('en', 'navigation', en);
i18n.addResourceBundle('tr', 'navigation', tr);
i18n.addResourceBundle('ar', 'navigation', ar);

/**
 * The navigationConfig object is an array of navigation items for the Fuse application.
 */
const navigationConfig: FuseNavItemType[] = [
	{
		id: 'workspace',
		title: 'Workspace',
		type: 'item',
		icon: 'lucide:layout-dashboard',
		url: 'workspace'
	},
	{
		id: 'projects',
		title: 'Projects',
		type: 'item',
		icon: 'lucide:kanban-square',
		url: 'workspace'
	},
	{
		id: 'agents',
		title: 'Agents',
		type: 'item',
		icon: 'lucide:bot',
		url: 'workspace'
	},
	{
		id: 'docs',
		title: 'Docs',
		type: 'item',
		icon: 'lucide:file-text',
		url: 'workspace'
	}
];

export default navigationConfig;

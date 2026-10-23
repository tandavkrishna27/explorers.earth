import { useParams } from "react-router-dom";
import ListPage from "../../../shared/list/ListPage";
import { useAppsListAdapter } from "../../../shared/list/adapters/apps";

const AppListView = () => {
  const { listId } = useParams();
  return <ListPage adapter={useAppsListAdapter(listId!)} />;
};
export default AppListView;

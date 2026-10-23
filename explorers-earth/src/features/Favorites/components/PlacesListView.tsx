import { useParams } from "react-router-dom";
import ListPage from "../../shared/list/ListPage";
import { usePlacesListAdapter } from "../../shared/list/adapters/places";

/** A Places list on the shared list page (WP6, PL-LIST-01). */
const PlacesListView = () => {
  const { listId } = useParams();
  return <ListPage adapter={usePlacesListAdapter(listId!)} />;
};
export default PlacesListView;

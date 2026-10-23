import { useParams } from "react-router-dom";
import ListPage from "../../../shared/list/ListPage";
import { usePeopleListAdapter } from "../../../shared/list/adapters/people";

const PersonListView = () => {
  const { listId } = useParams();
  return <ListPage adapter={usePeopleListAdapter(listId!)} />;
};
export default PersonListView;

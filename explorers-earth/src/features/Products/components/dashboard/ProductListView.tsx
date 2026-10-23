import { useParams } from "react-router-dom";
import ListPage from "../../../shared/list/ListPage";
import { useProductsListAdapter } from "../../../shared/list/adapters/products";

const ProductListView = () => {
  const { listId } = useParams();
  return <ListPage adapter={useProductsListAdapter(listId!)} />;
};
export default ProductListView;

# Welcome to TaxCat V2!

TaxCat is a Node.js Listening server that implements RabbitMQ's messaging protocol to listen for WordPress post publishes and updates and runs the body text through IMB's Watson cognitive text API, returning custom "Company" and "People" taxonomies, updating the relevant post.


# Setting up

**Prerequisites**
To set up your own local TaxCat instance, you first need a WordPress instance to work on. You will also need npm and node installed to run the server and to dependencies.

To install TaxCat, first you must make some additions to your WordPress theme functions.php file as well as add the JWT Authentication Plugin [ https://wordpress.org/plugins/jwt-authentication-for-wp-rest-api/ ]. Follow the installation instructions and set up the JSON auth correctly, then add the following code to the bottom of the functions.php file. *Note: If you want to have taxonomies other than company and people, this is where you would make those changes and other necessary changes in server.js and postidreciever.js*
```php
function custom_taxonomy()  
{  
  
    $labels = array(  
      'name' => 'People',  
      'singular_name' => 'People',  
      'menu_name' => 'People',  
      'all_items' => 'All People',  
      'parent_item' => 'Parent People Taxonomy',  
      'parent_item_colon' => 'Parent People Taxonomy:',  
      'new_item_name' => 'New People Info',  
      'add_new_item' => 'Add People Info',  
      'edit_item' => 'Edit People Info',  
      'update_item' => 'Update People Info',  
      'view_item' => 'View People Info',  
      'separate_items_with_commas' => 'Separate items with commas',  
      'add_or_remove_items' => 'Add or remove People Info',  
      'choose_from_most_used' => 'Choose from the most used',  
      'popular_items' => 'Popular People Info',  
      'search_items' => 'Search People Info',  
      'not_found' => 'Not Found',  
      'no_terms' => 'No People Info',  
      'items_list' => 'People list',  
      'items_list_navigation' => 'People list navigation',  
  );  
  $args = array(  
      'labels' => $labels,  
      'hierarchical' => false,  
      'public' => true,  
      'show_ui' => true,  
      'show_in_rest' => true,  
      'show_admin_column' => true,  
      'show_in_nav_menus' => true,  
      'show_tagcloud' => true,  
  );  
  register_taxonomy('people', array('post'), $args);  
  
  $labels = array(  
      'name' => 'Organization',  
      'singular_name' => 'Organization',  
      'menu_name' => 'Organization',  
      'all_items' => 'All Organizations',  
      'parent_item' => 'Parent Organization',  
      'parent_item_colon' => 'Parent Organizations:',  
      'new_item_name' => 'New Organization',  
      'add_new_item' => 'Add Organization',  
      'edit_item' => 'Edit Organization',  
      'update_item' => 'Update OOrganization',  
      'view_item' => 'View Organization',  
      'separate_items_with_commas' => 'Separate Organization with commas',  
      'add_or_remove_items' => 'Add or remove Organization',  
      'choose_from_most_used' => 'Choose from the most used',  
      'popular_items' => 'Popular Organizations',  
      'search_items' => 'Search Organizations',  
      'not_found' => 'Not Found',  
      'no_terms' => 'No Organization',  
      'items_list' => 'Organization list',  
      'items_list_navigation' => 'Organization list navigation',  
  );  
  $args = array(  
      'labels' => $labels,  
      'hierarchical' => false,  
      'public' => true,  
      'show_ui' => true,  
      'show_in_rest' => true,  
      'show_admin_column' => true,  
      'show_in_nav_menus' => true,  
      'show_tagcloud' => true,  
  );  
  register_taxonomy('organization', array('post'), $args);  
}  
add_action( 'init', 'custom_taxonomy', 0 );  
  
function sb_add_taxes_to_api() {  
  $taxonomies = get_taxonomies( '', 'objects' );  
  foreach( $taxonomies as $taxonomy ) {  
        $taxonomy->show_in_rest = true;  
  }  
}  
add_action( 'init', 'sb_add_taxes_to_api', 30 );  
  
function cmAC_add_terms( $post, $request, $creating) {  
    $params = $request->get_json_params();  
    if(array_key_exists("terms", $params)) {  
        remove_action('rest_after_insert_post', 'cmAC_add_terms');  
        foreach($params["terms"] as $taxonomy => $terms) {  
            wp_set_object_terms($post->ID, $terms, $taxonomy);  
        }  
        add_action('rest_after_insert_post', 'cmAC_add_terms');  
    }  
}  
add_action("rest_after_insert_post", "cmAC_add_terms", 10, 3);  
  
  
function cmAC_send_postID($post_ID) {  
  if( file_get_contents('php://input') ) {  
        return;  
  }  
  
    // Autosave, do nothing  
  if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE )  
        return;  
  // AJAX? Not used here  
  if ( defined( 'DOING_AJAX' ) && DOING_AJAX )  
        return;  
  // Check user permissions  
  if ( ! current_user_can( 'edit_post', $post_ID ) )  
        return;  
  // Return if it's a post revision  
  if ( false !== wp_is_post_revision( $post_ID ) )  
        return;  
  
  
  $args = array('headers' => array('Content-Type' => 'application/json'),  
  'body' => json_encode(array("postID" => $post_ID)),  
  'timeout' => '10',  
  'redirection' => '5',  
  'httpversion' => '1.0',  
  'blocking' => true,  
  'cookies' => array()  
  );  
  
  if( get_post_status($post_ID) == 'publish' ) {  
      remove_action('save_post', 'cmAC_send_postID');  
      wp_remote_post('http://localhost:3000/postID', $args);  
      add_action('save_post', 'cmAC_send_postID');  
  }  
  
}  
add_action('save_post', 'cmAC_send_postID',10,1);
```

 Next, navigate where you would like to install the package...
```sh
$ git clone ...
cd TaxCat
npm install
npm update
```
Before going any further, make sure to add the environment variables to the .ENV file. Open the .example.ENV and save as .ENV
```sh
node server.js
```
 Now open another shell instance
```sh
cd /Path/To/TaxCat/Instalation
node postidReviever.js
```
It is necessary to have two instances of shell open to run both processes of RabbitMQ (The publisher and the Worker).

## Dependencies

TaxCat dependes on a few basic packages to handle http requests, secret env variables, and messaging protocols. 
- Node.js [[https://nodejs.org/en/download/](https://nodejs.org/en/download/)]
- Express [[https://expressjs.com/en/starter/installing.html](https://expressjs.com/en/starter/installing.html)]
- RabbitMQ [[https://www.rabbitmq.com/#getstarted](https://www.rabbitmq.com/#getstarted)]
- Amqplib [[https://www.npmjs.com/package/amqplib](https://www.npmjs.com/package/amqplib)]
- Request [[https://github.com/request/request](https://github.com/request/request)]
- Dotenv [[https://www.npmjs.com/package/dotenv](https://www.npmjs.com/package/dotenv)]

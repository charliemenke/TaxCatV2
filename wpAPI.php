<?php

#include ('vendor/rmccue/requests/library/Requests.php');
require __DIR__ . '/vendor/autoload.php';
include ('jsonDecoder.php');
$falseFlags = array('Figure 1', 'Society of Experimental Test Pilots');

Requests::register_autoloader();
$dotenv = Dotenv\Dotenv::create(__DIR__);
$dotenv->load();
try {
    $dotenv->required('AZURE_ACCESS_KEY')->notEmpty();
    $dotenv->required('WATSON_ACCESS_KEY')->notEmpty();
    $dotenv->required('WORDPRESS_USER')->notEmpty();
    $dotenv->required('WORDPRESS_PASS')->notEmpty();
} catch(Exception $e) {
    echo "Error caught: ". $e->getMessage(). "\n Make sure you have saved your ENV files as .env\n";
}

//echo "Please Enter the PostID of which you want to update:\n";
//$stdin = fopen('php://stdin', 'r');
//$yes   = false;
//
//while (!$yes) {
//
//    trim(fscanf(STDIN, "%d\n", $postID));
//
//    if (is_numeric($postID)) {
//        echo "Updating your post....\n";
//        $yes = true;
//    } else {
//        echo "Sorry that is not a valid PostID. Please enter a numeric post ID:\n";
//    }
//}

$postID = $argv[1];

$azureAccessKey = getenv('AZURE_ACCESS_KEY');
$watsonAccessKey = getenv('WATSON_ACCESS_KEY');

$azureHost = 'https://westus.api.cognitive.microsoft.com';
$azurePath = '/text/analytics/v2.1/entities';

$watsonHost = 'https://gateway.watsonplatform.net';
$watsonPath = '/natural-language-understanding/api/v1/analyze?version=2018-11-16';


$token = getJWTToken(getenv('WORDPRESS_ROOT_PATH'),getenv('WORDPRESS_USER'), getenv('WORDPRESS_PASS'));
$subPost = getPostContent(getenv('WORDPRESS_ROOT_PATH'), $token, $postID);

$watsonResult = getWatsonEntities($watsonHost, $watsonPath, $watsonAccessKey, $subPost);

if(strlen($subPost) > 5000) {
    $subPost = substr($subPost, 0,5100);
}
if(strlen($subPost) < 50) {
    $subPost = "Failed to send post to Azure endpoint, either post_content is to short (less than 50 chars) or empty, or other error has occured";
}

$data = array (
    'documents' => array (
        array ( 'id' => '1', 'language' => 'en', 'text' => $subPost ),
    )
);

// Send post to Azure and separate relevant information (in this case: Organizations and Persons)
$azureResult = getAzureEntities($azureHost, $azurePath, $azureAccessKey, $data);

list($azureOrgArray, $azurePersonArray) = parseAzureResponse($azureResult);
list($watsonOrgArray, $watsonPersonArray) = parseWatsonResponse($watsonResult);
$personArray = array_unique(array_merge($watsonPersonArray,$azurePersonArray), SORT_REGULAR);
$orgArray = array_unique(array_merge($watsonOrgArray,$azureOrgArray), SORT_REGULAR);

$header = array(
    'Content-Type' => 'application/json',
    'Accept' => 'application/json',
    'Authorization' => 'Bearer '.$token
);
$data = array (
    'terms' => array(
        'people' => $personArray,
        'organization' => $orgArray
    )
);
Requests::post(getenv('WORDPRESS_ROOT_PATH')."/wp-json/wp/v2/posts/".$postID, $header, json_encode($data));
echo json_encode($data, JSON_PRETTY_PRINT);

// Write Post and associative arrays to results.txt
// IMPORTANT: this file is for debugging purposes and is overwritten every compile!
#file_put_contents('results.txt', json_encode(json_decode($watsonResult), JSON_PRETTY_PRINT), FILE_APPEND | LOCK_EX);



//* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
//                                          Helper functions below                                                //
//* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

function getAzureEntities ($host, $path, $key, $data) {

    $headers = "Content-type: text/json\r\n" .
        "Ocp-Apim-Subscription-Key: $key\r\n";

    $data = json_encode ($data);

    $options = array (
        'http' => array (
            'header' => $headers,
            'method' => 'POST',
            'content' => $data
        )
    );
    $context  = stream_context_create ($options);
    $result = file_get_contents($host . $path, false, $context);
    return $result;
};

function getWatsonEntities ($host, $path, $key, $data) {

    $auth =  base64_encode('apikey:'.$key);

    $headers = "Content-type: application/json\r\n" .
        "Authorization: Basic $auth\r\n";


    $params = array (
        "text" => $data,
        "features" => array (
            "entities" => array (
                "emotion" => false,
                "sentiment" => false,
                "limit" => 50
            ),
            "concepts" => array(
                "limit" => 8
            )
        )
    );

    $data = json_encode ($params);

    $options = array (
        'http' => array (
            'header' => $headers,
            'method' => 'POST',
            'content' => $data
        )
    );
    $context  = stream_context_create ($options);
    $result = file_get_contents($host . $path, false, $context);
    return $result;
};

function parseAzureResponse($json) {

    $orgArray = [];
    $personArray = [];
    $string = json_decode($json, true);

    foreach($string["documents"][0]["entities"] as $entities) {
        if($entities["type"] == "Organization" && array_key_exists("entityTypeScore",$entities['matches'][0])) {
            foreach($entities['matches'] as $match) {
                if(array_key_exists("wikipediaScore",$match)) {
                    if($match['wikipediaScore'] >= 0.5) {
                        $orgArray[] = $entities["name"];
                    }
                }
            }
        }
        if($entities["type"] == "Person") {
            if (array_key_exists("entityTypeScore",$entities['matches'][0])) {
                $personArray[] = $entities["name"];
            }
        }
    }

    return array(array_unique($orgArray, SORT_REGULAR),$personArray);

};

function parseWatsonResponse($json) {
    $orgArray = [];
    $personArray = [];
    $string = json_decode($json, true);

    foreach($string["entities"] as $entities) {
        if($entities['type'] == "Company") {
            $orgArray[] = $entities["text"];
        }
        if($entities['type'] == "Person") {
            $personArray[] = $entities["text"];
        }
    }
    return array($orgArray, $personArray);
}

function getJWTToken($url,$user,$pass) {
    $response = Requests::post($url."/wp-json/jwt-auth/v1/token",array(),array('username' => $user, 'password' => $pass));
    $user = $response->body;
    $user = JSON::clean($user);
    $user = strstr($user, "{");
    $user = json_decode($user,true);
    $token = $user['token'];
    $header = array(
        'Content-Type' => 'application/json',
        'Accept' => 'application/json',
        'Authorization' => 'Bearer '.$token
    );
    Requests::post(getenv('WORDPRESS_ROOT_PATH')."/wp-json/jwt-auth/v1/token/validate", $header);
    return $token;
}

function getPostContent($url, $token, $postID) {
    $header = array(
        'Content-Type' => 'application/json',
        'Accept' => 'application/json',
        'Authorization' => 'Bearer '.$token
    );
    $result = Requests::get($url."/wp-json/wp/v2/posts/".$postID, $header);
    $content = JSON::clean($result->body);
    $content = strstr($content, "{");
    $content = json_decode($content,true);
    return strip_tags($content['content']['rendered']);
}